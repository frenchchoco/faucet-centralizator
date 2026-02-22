/**
 * Faucet Centralizator — Fully Automated Deploy-All Script
 *
 * One command does everything:
 *   1. Generate a deployer wallet (or use existing mnemonic)
 *   2. Install all dependencies (contract, frontend, scripts)
 *   3. Build the smart contract WASM
 *   4. Show the P2TR address and wait for funding
 *   5. Deploy the FaucetManager contract on-chain
 *   6. Update frontend config with deployed contract address
 *   7. Build the frontend
 *   8. Deploy to Vercel
 *   9. Commit + push the contract address
 *
 * Usage:
 *   npm run deploy                  # regtest (default)
 *   npm run deploy -- --mainnet     # mainnet
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import readline from 'node:readline';

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
const CONTRACT_DIR = path.resolve(ROOT, 'contract');
const WASM_PATH = path.resolve(CONTRACT_DIR, 'build/FaucetManager.wasm');
const ENV_PATH = path.resolve(ROOT, '.env');
const CONTRACTS_TS = path.resolve(ROOT, 'frontend/src/config/contracts.ts');
const FRONTEND_DIR = path.resolve(ROOT, 'frontend');
const SCRIPTS_DIR = __dirname;

// ── Network config ────────────────────────────────────────────────

const isMainnet = process.argv.includes('--mainnet');
const NETWORK = isMainnet ? networks.bitcoin : networks.regtest;
const RPC_URL = isMainnet ? 'https://api.opnet.org' : 'https://regtest.opnet.org';
const NETWORK_LABEL = isMainnet ? 'mainnet' : 'regtest';
const CURRENCY = isMainnet ? 'BTC' : 'rBTC';
const FAUCET_URL = 'https://faucet.opnet.org';

const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_MS = isMainnet ? 30 * 60_000 : 10 * 60_000;

// ── Helpers ───────────────────────────────────────────────────────

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

function runVisible(cmd: string, cwd?: string): void {
    console.log(`  $ ${cmd}`);
    execSync(cmd, { cwd, stdio: 'inherit' });
}

function step(n: number, total: number, label: string): void {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  STEP ${n}/${total}: ${label}`);
    console.log('═'.repeat(60));
}

function loadEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    if (!fs.existsSync(ENV_PATH)) return env;
    const lines = fs.readFileSync(ENV_PATH, 'utf-8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (val) env[key] = val;
    }
    return env;
}

function saveEnv(entries: Record<string, string>): void {
    const lines = Object.entries(entries).map(([k, v]) => `${k}=${v}`);
    fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n', 'utf-8');
}

function waitForKeypress(message: string): Promise<void> {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        rl.question(message, () => {
            rl.close();
            resolve();
        });
    });
}

function depsInstalled(dir: string): boolean {
    return fs.existsSync(path.join(dir, 'node_modules', '.package-lock.json'));
}

// ── Main ──────────────────────────────────────────────────────────

const TOTAL_STEPS = 9;

async function main(): Promise<void> {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║      FAUCET CENTRALIZATOR — Deploy-All Pipeline          ║');
    console.log(`║      Network: ${NETWORK_LABEL.padEnd(44)}║`);
    console.log('║                                                          ║');
    console.log('║  This script automates EVERYTHING. Just sit back.        ║');
    console.log('║  The only manual step: funding your wallet with rBTC.    ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    // ── Step 1: Wallet ──────────────────────────────────────────

    step(1, TOTAL_STEPS, 'Generate or load deployer wallet');

    const env = loadEnv();
    let mnemonicPhrase = env['DEPLOYER_MNEMONIC'];

    if (!mnemonicPhrase) {
        console.log('  No DEPLOYER_MNEMONIC found. Generating a fresh wallet...');
        const generated = Mnemonic.generate(undefined, undefined, NETWORK, MLDSASecurityLevel.LEVEL2);
        mnemonicPhrase = generated.phrase;
        saveEnv({ ...env, DEPLOYER_MNEMONIC: mnemonicPhrase });
        console.log('  New mnemonic generated and saved to .env');
        console.log('');
        console.log('  ┌─────────────────────────────────────────────────────────┐');
        console.log('  │  IMPORTANT: Back up your .env file!                     │');
        console.log('  │  It contains your deployer wallet mnemonic.             │');
        console.log('  │  .env is gitignored and will NOT be pushed.             │');
        console.log('  └─────────────────────────────────────────────────────────┘');
    } else {
        console.log('  Found existing DEPLOYER_MNEMONIC in .env');
    }

    const mnemonic = new Mnemonic(mnemonicPhrase, '', NETWORK, MLDSASecurityLevel.LEVEL2);
    const wallet = mnemonic.derive(0);

    console.log('');
    console.log(`  P2TR address : ${wallet.p2tr}`);
    console.log(`  OPNet address: ${wallet.address.toHex()}`);

    // ── Step 2: Install all dependencies ────────────────────────

    step(2, TOTAL_STEPS, 'Install dependencies');

    if (depsInstalled(CONTRACT_DIR)) {
        console.log('  contract/   — already installed, skipping');
    } else {
        console.log('  contract/   — installing...');
        runVisible('npm install', CONTRACT_DIR);
    }

    if (depsInstalled(FRONTEND_DIR)) {
        console.log('  frontend/   — already installed, skipping');
    } else {
        console.log('  frontend/   — installing...');
        runVisible('npm install', FRONTEND_DIR);
    }

    if (depsInstalled(SCRIPTS_DIR)) {
        console.log('  scripts/    — already installed, skipping');
    } else {
        console.log('  scripts/    — installing...');
        runVisible('npm install', SCRIPTS_DIR);
    }

    console.log('  All dependencies ready.');

    // ── Step 3: Build contract WASM ─────────────────────────────

    step(3, TOTAL_STEPS, 'Build smart contract');

    if (fs.existsSync(WASM_PATH)) {
        const stats = fs.statSync(WASM_PATH);
        console.log(`  WASM already exists (${(stats.size / 1024).toFixed(1)} KB), rebuilding anyway...`);
    }

    runVisible('npm run build', CONTRACT_DIR);

    if (!fs.existsSync(WASM_PATH)) {
        throw new Error(`Contract build failed — WASM not found at ${WASM_PATH}`);
    }

    const bytecode = new Uint8Array(fs.readFileSync(WASM_PATH));
    console.log(`  Contract compiled: ${(bytecode.length / 1024).toFixed(1)} KB`);

    // ── Step 4: Fund the wallet ─────────────────────────────────

    step(4, TOTAL_STEPS, `Fund deployer wallet with ${CURRENCY}`);

    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    // Check if already funded
    let utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr });

    if (utxos.length > 0) {
        console.log(`  Already funded! Found ${utxos.length} UTXO(s). Skipping.`);
    } else {
        console.log('');
        console.log('  ╔═══════════════════════════════════════════════════════╗');
        console.log('  ║              MANUAL STEP REQUIRED                    ║');
        console.log('  ╠═══════════════════════════════════════════════════════╣');
        console.log('  ║                                                     ║');
        console.log(`  ║  1. Open: ${FAUCET_URL.padEnd(39)}║`);
        console.log('  ║                                                     ║');
        console.log('  ║  2. Paste this address:                             ║');
        console.log(`  ║     ${wallet.p2tr}║`);
        console.log('  ║                                                     ║');
        console.log(`  ║  3. Request ${CURRENCY.padEnd(41)}║`);
        console.log('  ║                                                     ║');
        console.log('  ╚═══════════════════════════════════════════════════════╝');
        console.log('');

        await waitForKeypress('  Press ENTER after you\'ve requested funds (the script will poll)...');

        console.log('');
        console.log(`  Polling for UTXOs (every ${POLL_INTERVAL_MS / 1000}s, max ${MAX_POLL_MS / 60_000} min)...`);

        const startTime = Date.now();
        utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr });

        while (utxos.length === 0) {
            const elapsed = Date.now() - startTime;
            if (elapsed >= MAX_POLL_MS) {
                throw new Error(
                    `Timeout: no UTXOs after ${MAX_POLL_MS / 60_000} min. ` +
                    `Fund ${wallet.p2tr} and re-run.`,
                );
            }
            const remaining = Math.ceil((MAX_POLL_MS - elapsed) / 1000);
            const mins = Math.floor(remaining / 60);
            const secs = remaining % 60;
            process.stdout.write(
                `\r  Waiting for on-chain confirmation... ${mins}m ${secs.toString().padStart(2, '0')}s remaining  `,
            );
            await sleep(POLL_INTERVAL_MS);
            utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr });
        }

        console.log(`\n  Funded! Found ${utxos.length} UTXO(s)`);
    }

    // ── Step 5: Deploy contract ─────────────────────────────────

    step(5, TOTAL_STEPS, 'Deploy FaucetManager contract');

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

    // ── Step 6: Update frontend config ──────────────────────────

    step(6, TOTAL_STEPS, 'Update frontend contract address');

    const contractsTsContent = [
        '/**',
        ` * FaucetManager contract address on ${NETWORK_LABEL}.`,
        ` * Auto-generated by deploy script — do not edit manually.`,
        ' */',
        `export const FAUCET_MANAGER_ADDRESS =`,
        `    '${contractAddress}';`,
        '',
    ].join('\n');

    fs.writeFileSync(CONTRACTS_TS, contractsTsContent, 'utf-8');
    console.log(`  Updated: frontend/src/config/contracts.ts`);
    console.log(`  Address: ${contractAddress}`);

    // ── Step 7: Build frontend ──────────────────────────────────

    step(7, TOTAL_STEPS, 'Build frontend');

    runVisible('npm run build', FRONTEND_DIR);
    console.log('  Frontend built successfully.');

    // ── Step 8: Deploy to Vercel ────────────────────────────────

    step(8, TOTAL_STEPS, 'Deploy to Vercel');

    let vercelUrl = '<not deployed>';

    // Check if Vercel CLI is available
    let hasVercel = false;
    try {
        run('npx vercel --version');
        hasVercel = true;
    } catch {
        console.log('  Vercel CLI not found. Skipping Vercel deployment.');
        console.log('  To deploy manually later:');
        console.log(`    cd frontend && npx vercel --prod`);
    }

    if (hasVercel) {
        // Check if linked
        const vercelDir = path.join(FRONTEND_DIR, '.vercel');
        if (!fs.existsSync(vercelDir)) {
            console.log('  Vercel project not linked. Running vercel link...');
            console.log('  (Follow the prompts to link your Vercel account)');
            console.log('');
            try {
                execSync('npx vercel link', {
                    cwd: FRONTEND_DIR,
                    stdio: 'inherit',
                });
            } catch {
                console.log('  Vercel link failed. Skipping Vercel deployment.');
                console.log('  To deploy manually later:');
                console.log(`    cd frontend && npx vercel link && npx vercel --prod`);
                hasVercel = false;
            }
        }
    }

    if (hasVercel) {
        try {
            console.log('  Deploying to production...');
            const output = run('npx vercel --prod --yes 2>&1', FRONTEND_DIR);
            const urlMatch = output.match(/https:\/\/[^\s]+/);
            vercelUrl = urlMatch ? urlMatch[0] : output;
        } catch {
            console.log('  Production deploy failed. Trying preview...');
            try {
                const output = run('npx vercel --yes 2>&1', FRONTEND_DIR);
                const urlMatch = output.match(/https:\/\/[^\s]+/);
                vercelUrl = urlMatch ? urlMatch[0] : output;
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                console.log(`  Vercel deploy failed: ${msg}`);
                console.log('  Deploy manually:');
                console.log(`    cd frontend && npx vercel --prod`);
            }
        }
    }

    // ── Step 9: Git commit + push ───────────────────────────────

    step(9, TOTAL_STEPS, 'Commit & push contract address');

    try {
        run('git add frontend/src/config/contracts.ts', ROOT);
        run(
            `git commit -m "deploy: set FaucetManager contract address (${NETWORK_LABEL})"`,
            ROOT,
        );
        run('git push', ROOT);
        console.log('  Contract address committed and pushed.');
    } catch {
        console.log('  (Could not auto-commit — commit manually if desired)');
    }

    // ── Summary ─────────────────────────────────────────────────

    console.log('');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║               DEPLOYMENT COMPLETE!                        ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  Network:   ${NETWORK_LABEL.padEnd(46)}║`);
    console.log(`║  Contract:  ${String(contractAddress).slice(0, 45).padEnd(46)}║`);
    console.log(`║  Frontend:  ${vercelUrl.slice(0, 45).padEnd(46)}║`);
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║  Your faucet is LIVE! Share the link and have fun.       ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
}

main().catch((err) => {
    console.error('\n  Deployment failed:', err);
    process.exit(1);
});
