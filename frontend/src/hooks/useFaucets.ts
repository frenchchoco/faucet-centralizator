import { useCallback, useEffect, useState } from 'react';
import { getContract } from 'opnet';
import type { Address } from '@btc-vision/transaction';
import { FAUCET_MANAGER_ABI } from '../abi/FaucetManagerABI.js';
import type { IFaucetManagerContract } from '../abi/FaucetManagerABI.js';
import { FAUCET_MANAGER_ADDRESS } from '../config/contracts.js';
import { CURRENT_NETWORK } from '../config/networks.js';
import { getProvider } from '../services/ProviderService.js';

export interface FaucetData {
    id: number;
    tokenAddress: Address;
    creator: Address;
    totalDeposited: bigint;
    remainingBalance: bigint;
    amountPerClaim: bigint;
    cooldownSeconds: bigint;
    active: boolean;
}

interface UseFaucetsReturn {
    faucets: FaucetData[];
    loading: boolean;
    error: string | null;
    refetch: () => void;
}

/**
 * Fetches all faucets by calling getFaucetCount() then getFaucet(i) for each.
 */
export function useFaucets(): UseFaucetsReturn {
    const [faucets, setFaucets] = useState<FaucetData[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchFaucets = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const provider = getProvider();
            const contract = getContract<IFaucetManagerContract>(
                FAUCET_MANAGER_ADDRESS,
                FAUCET_MANAGER_ABI,
                provider,
                CURRENT_NETWORK,
            );

            const countResult = await contract.getFaucetCount();
            const count = Number(countResult.properties.count);

            const results: FaucetData[] = [];

            for (let i = 1; i <= count; i++) {
                try {
                    const faucetResult = await contract.getFaucet(BigInt(i));
                    const props = faucetResult.properties;

                    results.push({
                        id: i,
                        tokenAddress: props.tokenAddress,
                        creator: props.creator,
                        totalDeposited: props.totalDeposited,
                        remainingBalance: props.remainingBalance,
                        amountPerClaim: props.amountPerClaim,
                        cooldownSeconds: props.cooldownSeconds,
                        active: props.active,
                    });
                } catch {
                    // Skip individual faucet errors
                }
            }

            setFaucets(results);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch faucets';
            setError(message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchFaucets();
    }, [fetchFaucets]);

    return { faucets, loading, error, refetch: fetchFaucets };
}

/**
 * Fetches a single faucet by ID.
 */
export function useFaucet(faucetId: number | null): {
    faucet: FaucetData | null;
    loading: boolean;
    error: string | null;
    refetch: () => void;
} {
    const [faucet, setFaucet] = useState<FaucetData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchFaucet = useCallback(async () => {
        if (!faucetId || faucetId < 1) {
            setFaucet(null);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const provider = getProvider();
            const contract = getContract<IFaucetManagerContract>(
                FAUCET_MANAGER_ADDRESS,
                FAUCET_MANAGER_ABI,
                provider,
                CURRENT_NETWORK,
            );

            const faucetResult = await contract.getFaucet(BigInt(faucetId));
            const props = faucetResult.properties;

            setFaucet({
                id: faucetId,
                tokenAddress: props.tokenAddress,
                creator: props.creator,
                totalDeposited: props.totalDeposited,
                remainingBalance: props.remainingBalance,
                amountPerClaim: props.amountPerClaim,
                cooldownSeconds: props.cooldownSeconds,
                active: props.active,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch faucet';
            setError(message);
            setFaucet(null);
        } finally {
            setLoading(false);
        }
    }, [faucetId]);

    useEffect(() => {
        void fetchFaucet();
    }, [fetchFaucet]);

    return { faucet, loading, error, refetch: fetchFaucet };
}
