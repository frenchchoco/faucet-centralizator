import type React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useFaucet } from '../hooks/useFaucets.js';
import { useTokenInfo } from '../hooks/useTokenInfo.js';
import { ClaimButton } from './ClaimButton.js';

const COOLDOWN_LABELS: Record<string, string> = {
    '0': 'One-shot',
    '3600': 'Hourly',
    '21600': '6 Hours',
    '43200': '12 Hours',
    '86400': 'Daily',
};

function getCooldownLabel(cooldownSeconds: bigint): string {
    const key = cooldownSeconds.toString();
    return COOLDOWN_LABELS[key] ?? `${cooldownSeconds}s`;
}

function formatTokenAmount(amount: bigint, decimals: number): string {
    const divisor = 10n ** BigInt(decimals);
    const whole = amount / divisor;
    const frac = amount % divisor;

    if (frac === 0n) return whole.toString();

    const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
    return `${whole}.${fracStr}`;
}

export function FaucetDetail(): React.JSX.Element {
    const { id } = useParams<{ id: string }>();
    const faucetId = id ? parseInt(id, 10) : null;
    const { faucet, loading, error, refetch } = useFaucet(faucetId);

    const tokenAddressHex = faucet?.tokenAddress.toHex() ?? null;
    const { tokenInfo } = useTokenInfo(tokenAddressHex);

    if (loading) {
        return (
            <div className="faucet-detail-wrapper">
                <div className="loading-state">Loading faucet...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="faucet-detail-wrapper">
                <div className="error-state">
                    <p>Error: {error}</p>
                    <Link to="/" className="btn">
                        Back to Faucets
                    </Link>
                </div>
            </div>
        );
    }

    if (!faucet) {
        return (
            <div className="faucet-detail-wrapper">
                <div className="empty-state">
                    <p>Faucet not found.</p>
                    <Link to="/" className="btn">
                        Back to Faucets
                    </Link>
                </div>
            </div>
        );
    }

    const decimals = tokenInfo?.decimals ?? 8;
    const totalFormatted = formatTokenAmount(faucet.totalDeposited, decimals);
    const remainingFormatted = formatTokenAmount(faucet.remainingBalance, decimals);
    const perClaimFormatted = formatTokenAmount(faucet.amountPerClaim, decimals);

    const progressPercent =
        faucet.totalDeposited > 0n
            ? Number((faucet.remainingBalance * 100n) / faucet.totalDeposited)
            : 0;

    return (
        <div className="faucet-detail-wrapper">
            <Link to="/" className="back-link">
                &larr; Back to Faucets
            </Link>

            <div className="faucet-detail-card">
                <div className="faucet-detail-header">
                    <h2>
                        {tokenInfo
                            ? `${tokenInfo.name} (${tokenInfo.symbol})`
                            : `Faucet #${faucet.id}`}
                    </h2>
                    <span className={`badge ${faucet.active ? 'badge-active' : 'badge-depleted'}`}>
                        {faucet.active ? 'Active' : 'Depleted'}
                    </span>
                </div>

                <div className="faucet-detail-body">
                    <div className="faucet-progress large">
                        <div className="progress-bar">
                            <div
                                className="progress-fill"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                        <span className="progress-text">
                            {remainingFormatted} / {totalFormatted}{' '}
                            {tokenInfo?.symbol ?? 'tokens'} remaining
                        </span>
                    </div>

                    <div className="detail-grid">
                        <div className="detail-item">
                            <span className="detail-label">Faucet ID</span>
                            <span className="detail-value">#{faucet.id}</span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label">Amount Per Claim</span>
                            <span className="detail-value">
                                {perClaimFormatted} {tokenInfo?.symbol ?? ''}
                            </span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label">Cooldown</span>
                            <span className="detail-value">
                                {getCooldownLabel(faucet.cooldownSeconds)}
                            </span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label">Token Address</span>
                            <span className="detail-value mono">
                                {tokenAddressHex
                                    ? `${tokenAddressHex.slice(0, 10)}...${tokenAddressHex.slice(-8)}`
                                    : 'N/A'}
                            </span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label">Creator</span>
                            <span className="detail-value mono">
                                {faucet.creator.toHex().slice(0, 10)}...
                                {faucet.creator.toHex().slice(-8)}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="faucet-detail-actions">
                    <ClaimButton
                        faucetId={faucet.id}
                        active={faucet.active}
                        cooldownSeconds={faucet.cooldownSeconds}
                        onClaimed={refetch}
                    />
                </div>
            </div>
        </div>
    );
}
