/**
 * Transfer remaining BTC from deployer wallet (BIP84) to OP_WALLET address (BIP86).
 *
 * Usage:  npx tsx transfer.ts
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
import { JSONRpcProvider } from 'opnet';

const NETWORK = networks.opnetTestnet;
const RPC_URL = 'https://testnet.opnet.org';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, '..', '.env');

function loadEnv(): Record<string, string> {
    if (!fs.existsSync(ENV_PATH)) return {};
    const out: Record<string, string> = {};
    for (const line of fs.readFileSync(ENV_PATH, 'utf-8').split('\n')) {
        const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
        if (m) out[m[1]] = m[2];
    }
    return out;
}

async function main() {
    const env = loadEnv();
    const mnemonicPhrase = env['DEPLOYER_MNEMONIC'];
    if (!mnemonicPhrase) throw new Error('DEPLOYER_MNEMONIC not set in .env');

    const mnemonic = new Mnemonic(mnemonicPhrase, '', NETWORK, MLDSASecurityLevel.LEVEL2);

    // Old deployer wallet (BIP84 — used by deploy script)
    const oldWallet = mnemonic.derive(0);
    // OP_WALLET-compatible wallet (BIP86)
    const opWallet = mnemonic.deriveOPWallet();

    console.log('Source  (BIP84):', oldWallet.p2tr);
    console.log('Dest    (BIP86):', opWallet.p2tr);

    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    // Fetch UTXOs from old wallet
    const utxos = await provider.utxoManager.getUTXOs({ address: oldWallet.p2tr });
    let total = 0n;
    for (const u of utxos) total += u.value;
    console.log(`\nUTXOs: ${utxos.length}, Total: ${total} sat (${(Number(total) / 1e8).toFixed(8)} tBTC)`);

    if (utxos.length === 0 || total === 0n) {
        console.log('Nothing to transfer.');
        mnemonic.zeroize();
        return;
    }

    // Build a simple BTC transfer using createBTCTransfer
    const factory = new TransactionFactory();
    const challenge = await provider.getChallenge();

    const result = await factory.createBTCTransfer({
        from: oldWallet.p2tr,
        to: opWallet.p2tr,
        utxos,
        signer: oldWallet.keypair,
        network: NETWORK,
        feeRate: 5,
        amount: total,
        autoAdjustAmount: true, // deduct fees from the amount
        priorityFee: 0n,
        gasSatFee: 0n,
        challenge,
    });

    console.log(`\nEstimated fees: ${result.estimatedFees} sat`);
    console.log('Broadcasting...');
    const broadcast = await provider.sendRawTransaction(result.tx, false);
    console.log('TX result:', JSON.stringify(broadcast, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2));

    mnemonic.zeroize();
    console.log('\nDone! Funds sent to your OP_WALLET address.');
}

main().catch(console.error);
