import { useMemo } from 'react';
import { JSONRpcProvider } from 'opnet';
import { getProvider } from '../services/ProviderService.js';

/**
 * Returns the singleton JSONRpcProvider instance.
 */
export function useProvider(): JSONRpcProvider {
    return useMemo(() => getProvider(), []);
}
