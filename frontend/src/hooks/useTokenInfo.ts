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

interface UseTokenInfoReturn {
    tokenInfo: TokenInfo | null;
    loading: boolean;
    error: string | null;
    refetch: () => void;
}

/**
 * Given a token contract address (0x hex string), fetches name, symbol, and decimals
 * using the OP_20 ABI via getContract.
 */
export function useTokenInfo(tokenAddress: string | null): UseTokenInfoReturn {
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
            const provider = getProvider();
            const contract = getContract<IOP20Contract>(
                tokenAddress,
                OP_20_ABI,
                provider,
                CURRENT_NETWORK,
            );

            const [nameResult, symbolResult, decimalsResult] = await Promise.all([
                contract.name(),
                contract.symbol(),
                contract.decimals(),
            ]);

            setTokenInfo({
                name: nameResult.properties.name,
                symbol: symbolResult.properties.symbol,
                decimals: decimalsResult.properties.decimals,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch token info';
            setError(message);
            setTokenInfo(null);
        } finally {
            setLoading(false);
        }
    }, [tokenAddress]);

    useEffect(() => {
        void fetchTokenInfo();
    }, [fetchTokenInfo]);

    return { tokenInfo, loading, error, refetch: fetchTokenInfo };
}
