import { useEffect, useState } from 'react';
import { getContract, OP_20_ABI } from 'opnet';
import type { IOP20Contract } from 'opnet';
import { CURRENT_NETWORK } from '../config/networks.js';
import { getProvider } from '../services/ProviderService.js';
import type { TokenInfo } from './useTokenInfo.js';

/**
 * Fetches token info for a list of unique token addresses.
 * Returns a map: tokenAddressHex → TokenInfo.
 */
export function useTokenInfoMap(addresses: string[]): Map<string, TokenInfo> {
    const [infoMap, setInfoMap] = useState<Map<string, TokenInfo>>(new Map());

    useEffect(() => {
        if (addresses.length === 0) return;

        let cancelled = false;

        void (async () => {
            const results = new Map<string, TokenInfo>();
            const provider = getProvider();

            await Promise.allSettled(
                addresses.map(async (addr) => {
                    try {
                        const c = getContract<IOP20Contract>(addr, OP_20_ABI, provider, CURRENT_NETWORK);
                        const [n, s, d] = await Promise.all([c.name(), c.symbol(), c.decimals()]);
                        results.set(addr, {
                            name: n.properties.name,
                            symbol: s.properties.symbol,
                            decimals: d.properties.decimals,
                        });
                    } catch {
                        /* skip failed tokens */
                    }
                }),
            );

            if (!cancelled) setInfoMap(results);
        })();

        return () => { cancelled = true; };
    }, [addresses.join(',')]);

    return infoMap;
}
