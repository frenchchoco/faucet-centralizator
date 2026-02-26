import { useCallback, useEffect, useRef, useState } from 'react';
import { getContract } from 'opnet';
import type { Address } from '@btc-vision/transaction';
import { FAUCET_MANAGER_ABI } from '../abi/FaucetManagerABI.js';
import type { IFaucetManagerContract } from '../abi/FaucetManagerABI.js';
import { FAUCET_MANAGER_ADDRESS } from '../config/contracts.js';
import { CURRENT_NETWORK } from '../config/networks.js';
import { getProvider } from '../services/ProviderService.js';
import { getPendingForFaucet, removePendingForFaucet } from './usePendingClaims.js';

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

function getManagerContract() {
    return getContract<IFaucetManagerContract>(
        FAUCET_MANAGER_ADDRESS, FAUCET_MANAGER_ABI, getProvider(), CURRENT_NETWORK,
    );
}

export function useFaucets() {
    const [faucets, setFaucets] = useState<FaucetData[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const initialLoadDone = useRef(false);
    const prevBalances = useRef<Map<number, bigint>>(new Map());

    const fetchFaucets = useCallback(async (silent = false) => {
        // Only show skeletons on initial load, not on refetch
        if (!silent) setLoading(true);
        setError(null);
        try {
            const contract = getManagerContract();
            const count = Number((await contract.getFaucetCount()).properties.count);
            const results: FaucetData[] = [];
            for (let i = 1; i <= count; i++) {
                try {
                    const p = (await contract.getFaucet(BigInt(i))).properties;
                    results.push({ id: i, ...p });
                } catch { /* skip */ }
            }

            // Reconcile pending claims against confirmed balance changes
            for (const f of results) {
                const prev = prevBalances.current.get(f.id);
                if (prev !== undefined && f.remainingBalance < prev) {
                    const drop = prev - f.remainingBalance;
                    const pending = getPendingForFaucet(f.id);
                    if (pending.count > 0 && pending.amount <= drop) {
                        removePendingForFaucet(f.id);
                    } else if (pending.count > 0) {
                        // Partial reconciliation: remove oldest entries that fit in the drop
                        const perClaim = f.amountPerClaim;
                        const confirmedCount = perClaim > 0n ? Number(drop / perClaim) : 0;
                        if (confirmedCount > 0) removePendingForFaucet(f.id, confirmedCount);
                    }
                }
                prevBalances.current.set(f.id, f.remainingBalance);
            }

            setFaucets(results);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch faucets');
        } finally {
            setLoading(false);
            initialLoadDone.current = true;
        }
    }, []);

    /** Silent refetch — updates data without showing skeletons */
    const silentRefetch = useCallback(() => {
        void fetchFaucets(true);
    }, [fetchFaucets]);

    useEffect(() => { void fetchFaucets(); }, [fetchFaucets]);

    return { faucets, loading, error, refetch: fetchFaucets, silentRefetch };
}

export function useFaucet(faucetId: number | null) {
    const [faucet, setFaucet] = useState<FaucetData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchFaucet = useCallback(async () => {
        if (!faucetId || faucetId < 1) { setFaucet(null); return; }
        setLoading(true);
        setError(null);
        try {
            const p = (await getManagerContract().getFaucet(BigInt(faucetId))).properties;
            setFaucet({ id: faucetId, ...p });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch faucet');
            setFaucet(null);
        } finally {
            setLoading(false);
        }
    }, [faucetId]);

    useEffect(() => { void fetchFaucet(); }, [fetchFaucet]);

    return { faucet, loading, error, refetch: fetchFaucet };
}
