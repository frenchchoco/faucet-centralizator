import { NETWORK_LABEL } from './networks.js';

/* ── Contract addresses per network ──────────────────────────
 * Auto-updated by deploy script — one address per network.
 * Hardcoded fallback to testnet for contest reliability.
 * ──────────────────────────────────────────────────────────── */
const ADDRESSES: Record<string, string> = {
    regtest: 'opr1sqrxdph4ut5z8ggs8wx6ccplfp8qsasx9uy08w3ld',
    testnet: 'opt1sqp45sjj7wplwl47l0zg28aursxncuydmxurd4q8s',
    mainnet: '',
};

export const FAUCET_MANAGER_ADDRESS = ADDRESSES[NETWORK_LABEL] || ADDRESSES['testnet'];
