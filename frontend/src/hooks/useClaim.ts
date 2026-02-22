import { useCallback, useState } from 'react';
import { getContract } from 'opnet';
import type { TransactionParameters } from 'opnet';
import { FAUCET_MANAGER_ABI } from '../abi/FaucetManagerABI.js';
import type { IFaucetManagerContract } from '../abi/FaucetManagerABI.js';
import { FAUCET_MANAGER_ADDRESS } from '../config/contracts.js';
import { CURRENT_NETWORK } from '../config/networks.js';
import { getProvider } from '../services/ProviderService.js';

interface UseClaimReturn {
    claim: (faucetId: number) => Promise<boolean>;
    loading: boolean;
    error: string | null;
    txId: string | null;
}

/**
 * Handles the claim flow: simulate then sendTransaction with signer:null.
 */
export function useClaim(walletAddress: string | null): UseClaimReturn {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [txId, setTxId] = useState<string | null>(null);

    const claimFaucet = useCallback(
        async (faucetId: number): Promise<boolean> => {
            if (!walletAddress) {
                setError('Wallet not connected');
                return false;
            }

            setLoading(true);
            setError(null);
            setTxId(null);

            try {
                const provider = getProvider();
                const contract = getContract<IFaucetManagerContract>(
                    FAUCET_MANAGER_ADDRESS,
                    FAUCET_MANAGER_ABI,
                    provider,
                    CURRENT_NETWORK,
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
                    refundTo: walletAddress,
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
        [walletAddress],
    );

    return { claim: claimFaucet, loading, error, txId };
}
