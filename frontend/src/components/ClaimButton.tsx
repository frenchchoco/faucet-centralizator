import type React from 'react';
import { useEffect, useState } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useClaim } from '../hooks/useClaim.js';
import { formatTime } from '../utils/format.js';

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

    return (
        <div className="claim-wrapper">
            <button className="btn btn-claim" disabled={disabled} onClick={() => void handleClaim()}>
                {label}
            </button>
            {loading && <p className="claim-status">Transaction in progress — check your wallet...</p>}
            {error && <p className="claim-error">{error}</p>}
            {txId && <p className="claim-success">Claimed! TX: {txId.slice(0, 16)}...</p>}
        </div>
    );
}
