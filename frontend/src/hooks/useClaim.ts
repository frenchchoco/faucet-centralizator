import { useCallback, useState } from 'react';
import { getContract } from 'opnet';
import type { TransactionParameters } from 'opnet';
import type { Address } from '@btc-vision/transaction';
import { FAUCET_MANAGER_ABI } from '../abi/FaucetManagerABI.js';
import type { IFaucetManagerContract } from '../abi/FaucetManagerABI.js';
import { FAUCET_MANAGER_ADDRESS } from '../config/contracts.js';
import { CURRENT_NETWORK } from '../config/networks.js';
import { getProvider } from '../services/ProviderService.js';

interface UseClaimReturn {
    claim: (faucetId: number, cooldownSeconds: bigint) => Promise<boolean>;
    loading: boolean;
    error: string | null;
    txId: string | null;
}

/**
 * Verify IP-based rate limit via Vercel Edge Function.
 * In dev mode (localhost) this is skipped.
 */
async function verifyIpRateLimit(faucetId: number, cooldownSeconds: bigint): Promise<void> {
    if (window.location.hostname === 'localhost') return;

    const res = await fetch('/api/verify-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            faucetId: String(faucetId),
            cooldownSeconds: Number(cooldownSeconds),
        }),
    });

    if (res.status === 429) {
        const data = (await res.json()) as { remainingSeconds: number };
        const mins = Math.ceil(data.remainingSeconds / 60);
        throw new Error(`IP rate limited. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
    }

    if (!res.ok) {
        throw new Error('Anti-sybil check failed');
    }
}

/**
 * Handles the claim flow: IP check → simulate → sendTransaction with signer:null.
 */
export function useClaim(
    walletAddress: string | null,
    publicKey: string | null,
    senderAddress: Address | null,
): UseClaimReturn {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [txId, setTxId] = useState<string | null>(null);

    const claimFaucet = useCallback(
        async (faucetId: number, cooldownSeconds: bigint): Promise<boolean> => {
            if (!walletAddress || !publicKey) {
                setError('Wallet not connected');
                return false;
            }

            setLoading(true);
            setError(null);
            setTxId(null);

            try {
                // Step 0: Anti-sybil IP check
                await verifyIpRateLimit(faucetId, cooldownSeconds);

                const provider = getProvider();
                const contract = getContract<IFaucetManagerContract>(
                    FAUCET_MANAGER_ADDRESS,
                    FAUCET_MANAGER_ABI,
                    provider,
                    CURRENT_NETWORK,
                    senderAddress ?? undefined,
                );

                // Step 1: Simulate the claim
                const simulationResult = await contract.claim(BigInt(faucetId));

                if (simulationResult.revert) {
                    setError(`Simulation reverted: ${simulationResult.revert}`);
                    return false;
                }

                // Step 2: Send the transaction (wallet handles signing)
                const txParams: TransactionParameters = {
                    signer: null,
                    mldsaSigner: null,
                    refundTo: publicKey,
                    maximumAllowedSatToSpend: 100_000n,
                    feeRate: 10,
                    network: CURRENT_NETWORK,
                };

                const receipt = await simulationResult.sendTransaction(txParams);
                setTxId(receipt.transactionId);
                return true;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Claim failed';
                setError(message);
                return false;
            } finally {
                setLoading(false);
            }
        },
        [walletAddress, publicKey, senderAddress],
    );

    return { claim: claimFaucet, loading, error, txId };
}
