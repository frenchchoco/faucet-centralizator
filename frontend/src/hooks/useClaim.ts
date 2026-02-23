import { useCallback, useState } from 'react';
import { getContract } from 'opnet';
import type { Address } from '@btc-vision/transaction';
import { FAUCET_MANAGER_ABI } from '../abi/FaucetManagerABI.js';
import type { IFaucetManagerContract } from '../abi/FaucetManagerABI.js';
import { FAUCET_MANAGER_ADDRESS } from '../config/contracts.js';
import { CURRENT_NETWORK } from '../config/networks.js';
import { getProvider } from '../services/ProviderService.js';

export function useClaim(walletAddress: string | null, senderAddress: Address | null) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [txId, setTxId] = useState<string | null>(null);

    const claim = useCallback(async (faucetId: number): Promise<boolean> => {
        if (!walletAddress) { setError('Wallet not connected'); return false; }
        setLoading(true);
        setError(null);
        setTxId(null);
        try {
            const contract = getContract<IFaucetManagerContract>(
                FAUCET_MANAGER_ADDRESS, FAUCET_MANAGER_ABI, getProvider(), CURRENT_NETWORK,
                senderAddress ?? undefined,
            );
            const sim = await contract.claim(BigInt(faucetId));
            if (sim.revert) { setError(`Simulation reverted: ${sim.revert}`); return false; }
            const receipt = await sim.sendTransaction({
                signer: null, mldsaSigner: null, refundTo: walletAddress,
                maximumAllowedSatToSpend: 100_000n, feeRate: 10, network: CURRENT_NETWORK,
            });
            setTxId(receipt.transactionId);
            return true;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Claim failed');
            return false;
        } finally {
            setLoading(false);
        }
    }, [walletAddress, senderAddress]);

    return { claim, loading, error, txId };
}
