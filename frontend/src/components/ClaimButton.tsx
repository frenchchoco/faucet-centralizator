import type React from 'react';
import { useEffect, useState } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useClaim } from '../hooks/useClaim.js';

interface ClaimButtonProps {
    faucetId: number;
    active: boolean;
    cooldownSeconds: bigint;
    onClaimed?: () => void;
}

/**
 * Claim button with three states: not connected, cooldown active (countdown), ready to claim.
 */
export function ClaimButton({
    faucetId,
    active,
    cooldownSeconds,
    onClaimed,
}: ClaimButtonProps): React.JSX.Element {
    const { walletAddress, publicKey } = useWalletConnect();
    const { claim, loading, error, txId } = useClaim(walletAddress, publicKey);
    const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);

    // Countdown timer for cooldown display
    useEffect(() => {
        if (cooldownRemaining <= 0) return;

        const interval = setInterval(() => {
            setCooldownRemaining((prev) => {
                if (prev <= 1) {
                    clearInterval(interval);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [cooldownRemaining]);

    const handleClaim = async (): Promise<void> => {
        const success = await claim(faucetId, cooldownSeconds);
        if (success) {
            // Set cooldown based on the faucet's cooldown period
            setCooldownRemaining(Number(cooldownSeconds));
            onClaimed?.();
        }
    };

    if (!walletAddress) {
        return (
            <button className="btn btn-claim disabled" disabled>
                Connect Wallet to Claim
            </button>
        );
    }

    if (!active) {
        return (
            <button className="btn btn-claim disabled" disabled>
                Faucet Depleted
            </button>
        );
    }

    if (cooldownRemaining > 0) {
        const hours = Math.floor(cooldownRemaining / 3600);
        const minutes = Math.floor((cooldownRemaining % 3600) / 60);
        const seconds = cooldownRemaining % 60;

        const timeStr =
            hours > 0
                ? `${hours}h ${minutes}m ${seconds}s`
                : minutes > 0
                  ? `${minutes}m ${seconds}s`
                  : `${seconds}s`;

        return (
            <button className="btn btn-claim cooldown" disabled>
                Cooldown: {timeStr}
            </button>
        );
    }

    return (
        <div className="claim-wrapper">
            <button
                className="btn btn-claim"
                disabled={loading}
                onClick={() => void handleClaim()}
            >
                {loading ? 'Claiming...' : 'Claim'}
            </button>
            {error && <p className="claim-error">{error}</p>}
            {txId && <p className="claim-success">TX: {txId.slice(0, 12)}...</p>}
        </div>
    );
}
