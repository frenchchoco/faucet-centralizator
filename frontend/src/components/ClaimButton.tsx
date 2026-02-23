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

    if (!walletAddress) return <button className="btn btn-claim disabled" disabled>Connect Wallet to Claim</button>;
    if (!active) return <button className="btn btn-claim disabled" disabled>Faucet Depleted</button>;
    if (claimed && isOneShot) return <button className="btn btn-claim disabled" disabled>Claimed ✓</button>;
    if (cooldownRemaining > 0) return <button className="btn btn-claim cooldown" disabled>Cooldown: {formatTime(cooldownRemaining)}</button>;

    return (
        <div className="claim-wrapper">
            <button className="btn btn-claim" disabled={loading} onClick={() => void handleClaim()}>
                {loading ? 'Claiming...' : 'Claim'}
            </button>
            {error && <p className="claim-error">{error}</p>}
            {txId && <p className="claim-success">TX: {txId.slice(0, 12)}...</p>}
        </div>
    );
}
