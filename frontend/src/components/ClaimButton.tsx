import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useClaim, simulateClaim, getLastClaimTime } from '../hooks/useClaim.js';
import type { ClaimStatus } from '../hooks/useClaim.js';
import { formatTime, humanizeError } from '../utils/format.js';
import { useToast } from './Toast.js';
import { COOLDOWN_POLL_SECONDS } from '../config/networks.js';

const ONE_SHOT_THRESHOLD = 18446744073709551615n;

interface ClaimButtonProps {
    faucetId: number;
    active: boolean;
    cooldownSeconds: bigint;
    onClaimed?: () => void;
}

export function ClaimButton({ faucetId, active, cooldownSeconds, onClaimed }: ClaimButtonProps): React.JSX.Element {
    const { walletAddress, address: senderAddress } = useWalletConnect();
    const { claim, loading, error, txId } = useClaim(walletAddress, senderAddress);
    const { toast } = useToast();

    const isOneShot = cooldownSeconds >= ONE_SHOT_THRESHOLD;

    // On-chain status from simulation
    const [onChainStatus, setOnChainStatus] = useState<ClaimStatus>('unknown');
    const [checking, setChecking] = useState(false);

    // Estimated countdown (visual only, not authoritative)
    const [estimatedRemaining, setEstimatedRemaining] = useState(0);

    // Track if we just claimed (to avoid re-check race)
    const justClaimedRef = useRef(false);
    // Track if we've done at least one simulation
    const hasCheckedRef = useRef(false);

    /* ── On-chain simulation check ───────────────────────── */
    const checkOnChain = useCallback(async () => {
        if (!senderAddress || !active || justClaimedRef.current) return;
        setChecking(true);
        try {
            const status = await simulateClaim(faucetId, senderAddress);
            setOnChainStatus(status);
            hasCheckedRef.current = true;

            // If on-chain says ready, clear any estimated timer
            if (status === 'ready') {
                setEstimatedRemaining(0);
            }
        } catch {
            setOnChainStatus('unknown');
        } finally {
            setChecking(false);
        }
    }, [faucetId, senderAddress, active]);

    /* ── Restore state from localStorage (instant, no async) ── */
    useEffect(() => {
        if (!walletAddress) return;

        const lastClaim = getLastClaimTime(faucetId, walletAddress);
        if (lastClaim <= 0) return;

        if (isOneShot) {
            // One-shot: if we have a record, show claimed immediately
            setOnChainStatus('already-claimed');
        } else {
            // Cooldown: calculate remaining time
            const elapsed = Math.floor((Date.now() - lastClaim) / 1000);
            const remaining = Math.max(0, Number(cooldownSeconds) - elapsed);
            if (remaining > 0) {
                setEstimatedRemaining(remaining);
                setOnChainStatus('cooldown');
            }
        }
    }, [walletAddress, faucetId, isOneShot, cooldownSeconds]);

    /* ── Run simulation when wallet becomes available ──────── */
    useEffect(() => {
        justClaimedRef.current = false;
        if (!senderAddress || !active) return;
        void checkOnChain();
    }, [senderAddress, active, checkOnChain]);

    /* ── Periodic on-chain polling ────────────────────────── */
    useEffect(() => {
        if (!senderAddress || !active) return;
        if (onChainStatus !== 'cooldown' && onChainStatus !== 'already-claimed' && estimatedRemaining <= 0) return;

        const interval = setInterval(() => {
            void checkOnChain();
        }, COOLDOWN_POLL_SECONDS * 1000);

        return () => clearInterval(interval);
    }, [senderAddress, active, onChainStatus, estimatedRemaining, checkOnChain]);

    /* ── Visual countdown timer ──────────────────────────── */
    useEffect(() => {
        if (estimatedRemaining <= 0) return;
        const interval = setInterval(() => {
            setEstimatedRemaining((prev) => {
                if (prev <= 1) { clearInterval(interval); return 0; }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [estimatedRemaining]);

    // When estimated timer hits 0, re-check on-chain
    useEffect(() => {
        if (estimatedRemaining === 0 && onChainStatus === 'cooldown') {
            void checkOnChain();
        }
    }, [estimatedRemaining, onChainStatus, checkOnChain]);

    /* ── Toast notifications ──────────────────────────────── */
    useEffect(() => {
        if (txId) toast(`Claimed! TX: ${txId.slice(0, 16)}…`, 'success');
    }, [txId]);

    useEffect(() => {
        if (error) toast(humanizeError(error), 'error');
    }, [error]);

    /* ── Handle claim ────────────────────────────────────── */
    const handleClaim = async () => {
        justClaimedRef.current = true;
        const success = await claim(faucetId);
        if (success) {
            if (isOneShot) {
                setOnChainStatus('already-claimed');
            } else {
                setOnChainStatus('cooldown');
                setEstimatedRemaining(Number(cooldownSeconds));
            }
            onClaimed?.();
            // Allow re-checks after a delay (wait for TX to be mined)
            setTimeout(() => { justClaimedRef.current = false; }, 15_000);
        } else {
            justClaimedRef.current = false;
        }
    };

    /* ── Derived state ───────────────────────────────────── */
    const inCooldown = onChainStatus === 'cooldown' || (estimatedRemaining > 0 && onChainStatus !== 'ready');
    const isClaimed = onChainStatus === 'already-claimed';
    const isDepleted = !active || onChainStatus === 'depleted';

    const disabled = !walletAddress || isDepleted || loading || isClaimed || inCooldown;

    let label = 'Claim';
    if (!walletAddress) label = 'Connect Wallet to Claim';
    else if (isDepleted) label = 'Faucet Depleted';
    else if (loading) label = 'Claiming…';
    else if (checking && !hasCheckedRef.current && onChainStatus === 'unknown') label = 'Checking…';
    else if (isClaimed) label = 'Claimed ✓';
    else if (inCooldown) {
        label = estimatedRemaining > 0
            ? `Cooldown: ${formatTime(estimatedRemaining)}`
            : 'Cooldown active…';
    }

    const btnClass = `btn btn-claim${isDepleted ? ' disabled' : ''}${inCooldown ? ' cooldown' : ''}`;

    return (
        <div className="claim-wrapper">
            <button className={btnClass} disabled={disabled} onClick={() => void handleClaim()}>
                {(loading || (checking && !hasCheckedRef.current && onChainStatus === 'unknown')) && <span className="btn-spinner" />}
                <span>{label}</span>
            </button>
        </div>
    );
}
