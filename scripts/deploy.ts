/**
 * FaucetManager Contract Deployment Script
 *
 * Usage:
 *   1. Copy ../.env.example to ../.env and fill in DEPLOYER_MNEMONIC
 *   2. cd scripts && npm install
 *   3. npm run deploy
 *
 * Environment variables:
 *   DEPLOYER_MNEMONIC - BIP-39 mnemonic phrase (24 words)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { networks } from '@btc-vision/bitcoin';
import {
    Mnemonic,
    MLDSASecurityLevel,
    TransactionFactory,
} from '@btc-vision/transaction';
import type { IDeploymentParameters } from '@btc-vision/transaction';
import { JSONRpcProvider } from 'opnet';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WASM_PATH = path.resolve(__dirname, '../contract/build/FaucetManager.wasm');
const ENV_PATH = path.resolve(__dirname, '../.env');
const RPC_URL = 'https://regtest.opnet.org';
const NETWORK = networks.regtest;

function loadEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    if (!fs.existsSync(ENV_PATH)) {
        throw new Error(`.env file not found at ${ENV_PATH}. Copy .env.example and fill in DEPLOYER_MNEMONIC.`);
    }
    const lines = fs.readFileSync(ENV_PATH, 'utf-8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        env[key] = value;
    }
    return env;
}

async function main(): Promise<void> {
    console.log('=== FaucetManager Deployment ===\n');

    // 1. Load mnemonic
    const env = loadEnv();
    const mnemonicPhrase = env['DEPLOYER_MNEMONIC'];
    if (!mnemonicPhrase) {
        throw new Error('DEPLOYER_MNEMONIC not set in .env');
    }

    // 2. Derive wallet
    console.log('Deriving wallet from mnemonic...');
    const mnemonic = new Mnemonic(
        mnemonicPhrase,
        '',
        NETWORK,
        MLDSASecurityLevel.LEVEL2,
    );
    const wallet = mnemonic.derive(0);
    console.log('P2TR address:', wallet.p2tr);
    console.log('OPNet address:', wallet.address.toHex());

    // 3. Read WASM bytecode
    if (!fs.existsSync(WASM_PATH)) {
        throw new Error(`WASM not found at ${WASM_PATH}. Run "cd contract && npm run build" first.`);
    }
    const bytecode = new Uint8Array(fs.readFileSync(WASM_PATH));
    console.log(`\nBytecode size: ${bytecode.length} bytes`);

    // 4. Connect to provider
    console.log(`\nConnecting to ${RPC_URL}...`);
    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    // 5. Get UTXOs
    const utxos = await provider.utxoManager.getUTXOs({
        address: wallet.p2tr,
    });

    if (utxos.length === 0) {
        throw new Error(
            `No UTXOs found for ${wallet.p2tr}. Fund this address with regtest BTC first.`,
        );
    }
    console.log(`Found ${utxos.length} UTXO(s)`);

    // 6. Get challenge
    const challenge = await provider.getChallenge();

    // 7. Build and sign deployment
    console.log('\nSigning deployment transaction...');
    const factory = new TransactionFactory();

    const deploymentParams: IDeploymentParameters = {
        from: wallet.p2tr,
        utxos: utxos,
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        network: NETWORK,
        feeRate: 5,
        priorityFee: 0n,
        gasSatFee: 10_000n,
        bytecode: bytecode,
        challenge: challenge,
        linkMLDSAPublicKeyToAddress: true,
        revealMLDSAPublicKey: true,
    };

    const deployment = await factory.signDeployment(deploymentParams);
    console.log('\nContract address:', deployment.contractAddress);

    // 8. Broadcast
    console.log('\nBroadcasting funding TX...');
    const fundingResult = await provider.sendRawTransaction(
        deployment.transaction[0],
        false,
    );
    console.log('Funding TX ID:', fundingResult.result);

    console.log('Broadcasting reveal TX...');
    const revealResult = await provider.sendRawTransaction(
        deployment.transaction[1],
        false,
    );
    console.log('Reveal TX ID:', revealResult.result);

    console.log('\n=== Deployment Complete ===');
    console.log('Contract address:', deployment.contractAddress);
    console.log(
        `\nUpdate frontend/src/config/contracts.ts with:\n  export const FAUCET_MANAGER_ADDRESS = '${deployment.contractAddress}';`,
    );

    // Cleanup
    mnemonic.zeroize();
    wallet.zeroize();
}

main().catch((err) => {
    console.error('\nDeployment failed:', err);
    process.exit(1);
});
