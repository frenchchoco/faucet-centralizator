import { networks } from '@btc-vision/bitcoin';

export const REGTEST_RPC_URL = 'https://regtest.opnet.org';

export const CURRENT_NETWORK = networks.regtest;

/** Average block interval in seconds per network */
export const BLOCK_INTERVAL_SECONDS =
    CURRENT_NETWORK === networks.regtest ? 600    // 10 min
    : CURRENT_NETWORK === networks.testnet ? 120  //  2 min
    : 600;                                        // mainnet ~10 min

/** How often to re-check on-chain cooldown status (seconds) */
export const COOLDOWN_POLL_SECONDS = Math.max(30, Math.floor(BLOCK_INTERVAL_SECONDS / 2));
