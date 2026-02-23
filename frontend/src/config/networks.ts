import { networks } from '@btc-vision/bitcoin';

/* ── Multi-network support ───────────────────────────────────
 * Set VITE_NETWORK to "regtest", "testnet", or "mainnet".
 * Defaults to "testnet" (contest network).
 * ──────────────────────────────────────────────────────────── */
const NET_NAME = (import.meta.env.VITE_NETWORK ?? 'testnet') as string;

export const CURRENT_NETWORK =
    NET_NAME === 'mainnet' ? networks.bitcoin
    : NET_NAME === 'regtest' ? networks.regtest
    : networks.opnetTestnet;

export const RPC_URL =
    NET_NAME === 'mainnet' ? 'https://api.opnet.org'
    : NET_NAME === 'regtest' ? 'https://regtest.opnet.org'
    : 'https://testnet.opnet.org';

export const NETWORK_LABEL = NET_NAME;

/** Average block interval in seconds per network */
export const BLOCK_INTERVAL_SECONDS =
    NET_NAME === 'regtest' ? 600    // 10 min
    : NET_NAME === 'testnet' ? 120  //  2 min
    : 600;                          // mainnet ~10 min

/** How often to re-check on-chain cooldown status (seconds) */
export const COOLDOWN_POLL_SECONDS = Math.max(30, Math.floor(BLOCK_INTERVAL_SECONDS / 2));
