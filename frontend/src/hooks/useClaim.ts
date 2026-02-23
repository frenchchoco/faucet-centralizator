import { useCallback, useState } from 'react';
import { getContract } from 'opnet';
import type { Address } from '@btc-vision/transaction';
import { FAUCET_MANAGER_ABI } from '../abi/FaucetManagerABI.js';
import type { IFaucetManagerContract } from '../abi/FaucetManagerABI.js';
import { FAUCET_MANAGER_ADDRESS } from '../config/contracts.js';
import { CURRENT_NETWORK } from '../config/networks.js';
import { getProvider } from '../services/ProviderService.js';

async function verifyIpRateLimit(faucetId: number, cooldownSeconds: bigint): Promise<void> {
    if (window.location.hostname === 'localhost') return;
    const res = await fetch('/api/verify-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ faucetId: String(faucetId), cooldownSeconds: Number(cooldownSeconds) }),
    });
    if (res.status === 429) {
        const data = (await res.json()) as { remainingSeconds: number };
        const mins = Math.ceil(data.remainingSeconds / 60);
        throw new Error(`IP rate limited. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
    }
    // Non-429 errors (e.g. KV down) → fail-open, on-chain cooldown is the source of truth
}

async function recordIpClaim(faucetId: number, cooldownSeconds: bigint): Promise<void> {
    if (window.location.hostname === 'localhost') return;
    await fetch('/api/record-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ faucetId: String(faucetId), cooldownSeconds: Number(cooldownSeconds) }),
    }).catch(() => { /* non-blocking */ });
}

export function useClaim(walletAddress: string | null, senderAddress: Address | null) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [txId, setTxId] = useState<string | null>(null);

    const claim = useCallback(async (faucetId: number, cooldownSeconds: bigint): Promise<boolean> => {
        if (!walletAddress) { setError('Wallet not connected'); return false; }
        setLoading(true);
        setError(null);
        setTxId(null);
        try {
            await verifyIpRateLimit(faucetId, cooldownSeconds);
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
            await recordIpClaim(faucetId, cooldownSeconds);
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
