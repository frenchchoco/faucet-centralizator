import { useCallback, useEffect, useState } from 'react';
import { getContract, OP_20_ABI } from 'opnet';
import type { IOP20Contract } from 'opnet';
import { CURRENT_NETWORK } from '../config/networks.js';
import { getProvider } from '../services/ProviderService.js';

export interface TokenInfo {
    name: string;
    symbol: string;
    decimals: number;
}

export function useTokenInfo(tokenAddress: string | null) {
    const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchTokenInfo = useCallback(async () => {
        if (!tokenAddress || tokenAddress.length < 10) {
            setTokenInfo(null);
            setError(null);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const c = getContract<IOP20Contract>(tokenAddress, OP_20_ABI, getProvider(), CURRENT_NETWORK);
            const [n, s, d] = await Promise.all([c.name(), c.symbol(), c.decimals()]);
            setTokenInfo({ name: n.properties.name, symbol: s.properties.symbol, decimals: d.properties.decimals });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch token info');
            setTokenInfo(null);
        } finally {
            setLoading(false);
        }
    }, [tokenAddress]);

    useEffect(() => { void fetchTokenInfo(); }, [fetchTokenInfo]);

    return { tokenInfo, loading, error, refetch: fetchTokenInfo };
}
