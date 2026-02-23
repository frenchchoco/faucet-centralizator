import { JSONRpcProvider } from 'opnet';
import { RPC_URL, CURRENT_NETWORK } from '../config/networks.js';

let provider: JSONRpcProvider | null = null;

export function getProvider(): JSONRpcProvider {
    if (!provider) {
        provider = new JSONRpcProvider({ url: RPC_URL, network: CURRENT_NETWORK });
    }
    return provider;
}
