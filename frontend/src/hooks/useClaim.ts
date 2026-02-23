import { useCallback, useState } from 'react';
import { getContract } from 'opnet';
import type { Address } from '@btc-vision/transaction';
import { FAUCET_MANAGER_ABI } from '../abi/FaucetManagerABI.js';
import type { IFaucetManagerContract } from '../abi/FaucetManagerABI.js';
import { FAUCET_MANAGER_ADDRESS } from '../config/contracts.js';
import { CURRENT_NETWORK } from '../config/networks.js';
import { getProvider } from '../services/ProviderService.js';

/* ── localStorage helpers ─────────────────────────────────── */
function claimKey(faucetId: number, wallet: string): string {
    return `claim:${faucetId}:${wallet}`;
}

export function getLastClaimTime(faucetId: number, wallet: string): number {
    try {
        return Number(localStorage.getItem(claimKey(faucetId, wallet)) ?? '0');
    } catch { return 0; }
}

function saveClaimTime(faucetId: number, wallet: string): void {
    try {
        localStorage.setItem(claimKey(faucetId, wallet), String(Date.now()));
    } catch { /* quota exceeded — ignore */ }
}

/* ── Contract helper ──────────────────────────────────────── */
function getManager(sender?: Address) {
    return getContract<IFaucetManagerContract>(
        FAUCET_MANAGER_ADDRESS, FAUCET_MANAGER_ABI, getProvider(), CURRENT_NETWORK,
        sender ?? undefined,
    );
}

/* ── Claim status types ───────────────────────────────────── */
export type ClaimStatus = 'ready' | 'cooldown' | 'already-claimed' | 'depleted' | 'unknown';

/**
 * Simulate a claim to check if it would succeed on-chain right now.
 * Returns a status string parsed from the revert reason (if any).
 */
export async function simulateClaim(faucetId: number, sender?: Address): Promise<ClaimStatus> {
    try {
        const sim = await getManager(sender).claim(BigInt(faucetId));
        if (sim.revert) {
            const r = sim.revert;
            if (/already claimed/i.test(r)) return 'already-claimed';
            if (/cooldown/i.test(r)) return 'cooldown';
            if (/insufficient remaining|not active/i.test(r)) return 'depleted';
            return 'unknown';
        }
        return 'ready'; // simulation succeeded — user CAN claim
    } catch {
        return 'unknown';
    }
}

/* ── Anti-sybil helpers (Vercel Edge + KV) ───────────────── */
async function verifyClaim(faucetId: number, cooldownSeconds: number): Promise<{ allowed: boolean; remainingSeconds?: number }> {
    try {
        const res = await fetch('/api/verify-claim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ faucetId: String(faucetId), cooldownSeconds }),
        });
        return (await res.json()) as { allowed: boolean; remainingSeconds?: number };
    } catch {
        // If anti-sybil is unavailable (no KV, local dev), allow claim
        return { allowed: true };
    }
}

async function recordClaim(faucetId: number, cooldownSeconds: number): Promise<void> {
    try {
        await fetch('/api/record-claim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ faucetId: String(faucetId), cooldownSeconds }),
        });
    } catch { /* best-effort — claim already succeeded on-chain */ }
}

/* ── Hook ─────────────────────────────────────────────────── */
export function useClaim(walletAddress: string | null, senderAddress: Address | null) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [txId, setTxId] = useState<string | null>(null);

    const claim = useCallback(async (faucetId: number, cooldownSeconds?: number): Promise<boolean> => {
        if (!walletAddress) { setError('Wallet not connected'); return false; }
        setLoading(true);
        setError(null);
        setTxId(null);
        try {
            // Anti-sybil: check IP rate limit before claiming
            const cd = cooldownSeconds ?? 0;
            const check = await verifyClaim(faucetId, cd);
            if (!check.allowed) {
                const wait = check.remainingSeconds ? ` (${Math.ceil(check.remainingSeconds / 60)} min remaining)` : '';
                setError(`Rate limited — try again later${wait}`);
                return false;
            }

            const contract = getManager(senderAddress ?? undefined);
            const sim = await contract.claim(BigInt(faucetId));
            if (sim.revert) { setError(`Simulation reverted: ${sim.revert}`); return false; }
            const receipt = await sim.sendTransaction({
                signer: null, mldsaSigner: null, refundTo: walletAddress,
                maximumAllowedSatToSpend: 100_000n, feeRate: 10, network: CURRENT_NETWORK,
            });
            setTxId(receipt.transactionId);
            // Persist claim time locally
            saveClaimTime(faucetId, walletAddress);
            // Record claim in Vercel KV for IP-based rate limiting
            void recordClaim(faucetId, cd);
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
