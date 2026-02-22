import { JSONRpcProvider } from 'opnet';
import { REGTEST_RPC_URL, CURRENT_NETWORK } from '../config/networks.js';

let provider: JSONRpcProvider | null = null;

/**
 * Returns a singleton JSONRpcProvider instance for the current network.
 */
export function getProvider(): JSONRpcProvider {
    if (!provider) {
        provider = new JSONRpcProvider({
            url: REGTEST_RPC_URL,
            network: CURRENT_NETWORK,
        });
    }
    return provider;
}
