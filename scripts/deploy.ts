/**
 * Faucet Centralizator — Full Deploy Script
 *
 * This script handles the entire deployment pipeline:
 *   1. Derive deployer wallet from mnemonic
 *   2. Show the P2TR address and ask the user to fund it
 *   3. Poll until the address has UTXOs (10 min max on regtest, balance check on mainnet)
 *   4. Deploy the FaucetManager contract
 *   5. Update frontend/src/config/contracts.ts with the deployed address
 *   6. Build the frontend
 *   7. Deploy to Vercel
 *   8. Print the live URL
 *
 * Usage:
 *   1. Copy ../.env.example to ../.env and set DEPLOYER_MNEMONIC
 *   2. cd scripts && npm install
 *   3. npm run deploy                  # regtest (default)
 *   3. npm run deploy -- --mainnet     # mainnet
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import { networks } from '@btc-vision/bitcoin';
import {
    Mnemonic,
    MLDSASecurityLevel,
    TransactionFactory,
} from '@btc-vision/transaction';
import type { IDeploymentParameters } from '@btc-vision/transaction';
import { JSONRpcProvider } from 'opnet';

// ── Paths ─────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WASM_PATH = path.resolve(ROOT, 'contract/build/FaucetManager.wasm');
const ENV_PATH = path.resolve(ROOT, '.env');
const CONTRACTS_TS = path.resolve(ROOT, 'frontend/src/config/contracts.ts');
const FRONTEND_DIR = path.resolve(ROOT, 'frontend');

// ── Network config ────────────────────────────────────────────────

const isMainnet = process.argv.includes('--mainnet');
const NETWORK = isMainnet ? networks.bitcoin : networks.regtest;
const RPC_URL = isMainnet ? 'https://api.opnet.org' : 'https://regtest.opnet.org';
const NETWORK_LABEL = isMainnet ? 'mainnet' : 'regtest';
const CURRENCY = isMainnet ? 'BTC' : 'rBTC';

// regtest blocktime ~10 min, mainnet we just check balance
const POLL_INTERVAL_MS = 10_000; // 10 seconds between checks
const MAX_POLL_MS = isMainnet ? 30 * 60_000 : 10 * 60_000; // 30 min mainnet, 10 min regtest

// ── Helpers ───────────────────────────────────────────────────────

function loadEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    if (!fs.existsSync(ENV_PATH)) {
        throw new Error(
            `.env file not found at ${ENV_PATH}. Copy .env.example and fill in DEPLOYER_MNEMONIC.`,
        );
    }
    const lines = fs.readFileSync(ENV_PATH, 'utf-8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
    return env;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(cmd: string, cwd?: string): string {
    console.log(`  $ ${cmd}`);
    return execSync(cmd, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf-8',
    }).trim();
}

function step(n: number, label: string): void {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  STEP ${n}: ${label}`);
    console.log('═'.repeat(60));
}

// ── Main ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║     FAUCET CENTRALIZATOR — Full Deployment Pipeline       ║');
    console.log(`║     Network: ${NETWORK_LABEL.padEnd(45)}║`);
    console.log('╚════════════════════════════════════════════════════════════╝');

    // ── Step 1: Derive wallet ──────────────────────────────────

    step(1, 'Derive deployer wallet');

    const env = loadEnv();
    const mnemonicPhrase = env['DEPLOYER_MNEMONIC'];
    if (!mnemonicPhrase) {
        throw new Error('DEPLOYER_MNEMONIC not set in .env');
    }

    const mnemonic = new Mnemonic(mnemonicPhrase, '', NETWORK, MLDSASecurityLevel.LEVEL2);
    const wallet = mnemonic.derive(0);

    console.log(`  P2TR address : ${wallet.p2tr}`);
    console.log(`  OPNet address: ${wallet.address.toHex()}`);

    // ── Step 2: Check WASM ─────────────────────────────────────

    step(2, 'Verify contract WASM');

    if (!fs.existsSync(WASM_PATH)) {
        console.log('  WASM not found. Building contract...');
        run('npm run build', path.resolve(ROOT, 'contract'));
    }

    const bytecode = new Uint8Array(fs.readFileSync(WASM_PATH));
    console.log(`  Bytecode ready: ${bytecode.length} bytes`);

    // ── Step 3: Wait for funding ───────────────────────────────

    step(3, `Fund the deployer wallet with ${CURRENCY}`);

    console.log('');
    console.log('  ┌──────────────────────────────────────────────────────┐');
    console.log(`  │  Send ${CURRENCY} to:                                       │`);
    console.log(`  │  ${wallet.p2tr}  │`);
    console.log('  └──────────────────────────────────────────────────────┘');
    console.log('');
    console.log(`  Waiting for UTXOs (polling every ${POLL_INTERVAL_MS / 1000}s, max ${MAX_POLL_MS / 60_000} min)...`);

    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
    const startTime = Date.now();
    let utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr });

    while (utxos.length === 0) {
        const elapsed = Date.now() - startTime;
        if (elapsed >= MAX_POLL_MS) {
            throw new Error(
                `Timeout: no UTXOs found after ${MAX_POLL_MS / 60_000} minutes. ` +
                    `Fund ${wallet.p2tr} and re-run the script.`,
            );
        }
        const remaining = Math.ceil((MAX_POLL_MS - elapsed) / 1000);
        process.stdout.write(`\r  Checking... (${remaining}s remaining)  `);
        await sleep(POLL_INTERVAL_MS);
        utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr });
    }

    console.log(`\n  Funded! Found ${utxos.length} UTXO(s)`);

    // ── Step 4: Deploy contract ────────────────────────────────

    step(4, 'Deploy FaucetManager contract');

    const challenge = await provider.getChallenge();
    const factory = new TransactionFactory();

    const deploymentParams: IDeploymentParameters = {
        from: wallet.p2tr,
        utxos,
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        network: NETWORK,
        feeRate: 5,
        priorityFee: 0n,
        gasSatFee: 10_000n,
        bytecode,
        challenge,
        linkMLDSAPublicKeyToAddress: true,
        revealMLDSAPublicKey: true,
    };

    console.log('  Signing deployment transaction...');
    const deployment = await factory.signDeployment(deploymentParams);
    const contractAddress = deployment.contractAddress;
    console.log(`  Contract address: ${contractAddress}`);

    console.log('  Broadcasting funding TX...');
    const fundingResult = await provider.sendRawTransaction(deployment.transaction[0], false);
    console.log(`  Funding TX: ${fundingResult.result ?? 'submitted'}`);

    console.log('  Broadcasting reveal TX...');
    const revealResult = await provider.sendRawTransaction(deployment.transaction[1], false);
    console.log(`  Reveal TX:  ${revealResult.result ?? 'submitted'}`);

    // Cleanup sensitive material
    mnemonic.zeroize();
    wallet.zeroize();

    // ── Step 5: Update frontend contract address ───────────────

    step(5, 'Update frontend contract address');

    const contractsTsContent = [
        '/**',
        ` * FaucetManager contract address on ${NETWORK_LABEL}.`,
        ' */',
        `export const FAUCET_MANAGER_ADDRESS =`,
        `    '${contractAddress}';`,
        '',
    ].join('\n');

    fs.writeFileSync(CONTRACTS_TS, contractsTsContent, 'utf-8');
    console.log(`  Updated ${CONTRACTS_TS}`);
    console.log(`  Address: ${contractAddress}`);

    // ── Step 6: Build frontend ─────────────────────────────────

    step(6, 'Build frontend');

    run('npm run build', FRONTEND_DIR);
    console.log('  Frontend built successfully');

    // ── Step 7: Deploy to Vercel ───────────────────────────────

    step(7, 'Deploy to Vercel');

    let vercelUrl: string;
    try {
        // Try production deploy first
        vercelUrl = run('npx vercel --prod --yes 2>&1', FRONTEND_DIR);
    } catch {
        console.log('  Production deploy failed. Trying preview deploy...');
        console.log('  (You may need to run "npx vercel link" first)');
        try {
            vercelUrl = run('npx vercel --yes 2>&1', FRONTEND_DIR);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.log(`\n  Vercel deploy failed: ${msg}`);
            console.log('  You can deploy manually:');
            console.log(`    cd ${FRONTEND_DIR} && npx vercel --prod`);
            vercelUrl = '<deploy manually>';
        }
    }

    // Extract URL from vercel output (last line is usually the URL)
    const urlMatch = vercelUrl.match(/https:\/\/[^\s]+/);
    const finalUrl = urlMatch ? urlMatch[0] : vercelUrl;

    // ── Done ───────────────────────────────────────────────────

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                  DEPLOYMENT COMPLETE                       ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  Network:  ${NETWORK_LABEL.padEnd(47)}║`);
    console.log(`║  Contract: ${contractAddress.slice(0, 46)}...║`);
    console.log(`║  Frontend: ${finalUrl.slice(0, 47).padEnd(47)}║`);
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');

    // Also commit the contract address update + push
    try {
        run('git add frontend/src/config/contracts.ts', ROOT);
        run(
            `git commit -m "feat: set deployed contract address (${NETWORK_LABEL})"`,
            ROOT,
        );
        run('git push', ROOT);
        console.log('  Contract address committed and pushed to GitHub.');
    } catch {
        console.log('  (Could not auto-commit — commit the contract address manually)');
    }

    console.log('\nDone!');
}

main().catch((err) => {
    console.error('\nDeployment failed:', err);
    process.exit(1);
});
