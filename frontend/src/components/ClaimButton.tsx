import type React from 'react';
import { useEffect, useState } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useClaim } from '../hooks/useClaim.js';
import { formatTime, humanizeError } from '../utils/format.js';
import { useToast } from './Toast.js';

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
    const [cooldownRemaining, setCooldownRemaining] = useState(0);
    const [claimed, setClaimed] = useState(false);
    const isOneShot = cooldownSeconds >= ONE_SHOT_THRESHOLD;

    useEffect(() => {
        if (cooldownRemaining <= 0) return;
        const interval = setInterval(() => {
            setCooldownRemaining((prev) => { if (prev <= 1) { clearInterval(interval); return 0; } return prev - 1; });
        }, 1000);
        return () => clearInterval(interval);
    }, [cooldownRemaining]);

    useEffect(() => {
        if (txId) toast(`Claimed! TX: ${txId.slice(0, 16)}...`, 'success');
    }, [txId]);

    useEffect(() => {
        if (error) toast(humanizeError(error), 'error');
    }, [error]);

    const handleClaim = async () => {
        if (await claim(faucetId)) {
            setClaimed(true);
            if (!isOneShot) setCooldownRemaining(Number(cooldownSeconds));
            onClaimed?.();
        }
    };

    const disabled = !walletAddress || !active || loading || (claimed && isOneShot) || cooldownRemaining > 0;

    let label = 'Claim';
    if (!walletAddress) label = 'Connect Wallet to Claim';
    else if (!active) label = 'Faucet Depleted';
    else if (loading) label = 'Claiming...';
    else if (claimed && isOneShot) label = 'Claimed ✓';
    else if (cooldownRemaining > 0) label = `Cooldown: ${formatTime(cooldownRemaining)}`;

    const btnClass = `btn btn-claim${!active ? ' disabled' : ''}${cooldownRemaining > 0 ? ' cooldown' : ''}`;

    return (
        <div className="claim-wrapper">
            <button className={btnClass} disabled={disabled} onClick={() => void handleClaim()}>
                {loading && <span className="btn-spinner" />}
                <span>{label}</span>
            </button>
        </div>
    );
}
