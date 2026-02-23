import { NETWORK_LABEL } from './networks.js';

/* ── Contract addresses per network ──────────────────────────
 * Auto-updated by deploy script — one address per network.
 * ──────────────────────────────────────────────────────────── */
const ADDRESSES: Record<string, string> = {
    regtest: 'opr1sqrxdph4ut5z8ggs8wx6ccplfp8qsasx9uy08w3ld',
    testnet: '',
    mainnet: '',
};

export const FAUCET_MANAGER_ADDRESS = ADDRESSES[NETWORK_LABEL] ?? '';
