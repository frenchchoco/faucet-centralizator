import type React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useFaucet } from '../hooks/useFaucets.js';
import { useTokenInfo } from '../hooks/useTokenInfo.js';
import { usePendingClaims } from '../hooks/usePendingClaims.js';
import { ClaimButton } from './ClaimButton.js';
import { getCooldownLabel, formatTokenAmount } from '../utils/format.js';
import type { FaucetData } from '../hooks/useFaucets.js';

function FaucetDetailInner({ faucet, refetch }: { faucet: FaucetData; refetch: () => void }): React.JSX.Element {
    const tokenHex = faucet.tokenAddress.toHex();
    const { tokenInfo } = useTokenInfo(tokenHex);
    const pending = usePendingClaims(faucet.id);

    const d = tokenInfo?.decimals ?? 8;
    const progress = faucet.totalDeposited > 0n ? Number((faucet.remainingBalance * 100n) / faucet.totalDeposited) : 0;
    const pendingProgress = faucet.totalDeposited > 0n ? Number((pending.amount * 100n) / faucet.totalDeposited) : 0;

    return (
        <div className="faucet-detail-wrapper">
            <Link to="/" className="back-link">&larr; Back to Faucets</Link>
            <div className="faucet-detail-card">
                <div className="faucet-detail-header">
                    <h2>{tokenInfo ? `${tokenInfo.name} (${tokenInfo.symbol})` : `Faucet #${faucet.id}`}</h2>
                    <div className="badge-group">
                        <span className={`badge ${faucet.active ? 'badge-active' : 'badge-depleted'}`}>
                            {faucet.active ? 'Active' : 'Depleted'}
                        </span>
                        {pending.count > 0 && (
                            <span className="badge badge-pending">{pending.count} pending</span>
                        )}
                    </div>
                </div>
                <div className="faucet-detail-body">
                    <div className="faucet-progress large">
                        <div className="progress-bar">
                            <div className="progress-fill" style={{ width: `${progress}%` }} />
                            {pendingProgress > 0 && (
                                <div className="progress-pending" style={{ width: `${pendingProgress}%`, left: `${Math.max(0, progress - pendingProgress)}%` }} />
                            )}
                        </div>
                        <span className="progress-text">
                            {formatTokenAmount(faucet.remainingBalance, d)} / {formatTokenAmount(faucet.totalDeposited, d)} {tokenInfo?.symbol ?? 'tokens'} remaining
                            {pending.count > 0 && ` (-${formatTokenAmount(pending.amount, d)} pending)`}
                        </span>
                    </div>
                    <div className="detail-grid">
                        <div className="detail-item"><span className="detail-label">Faucet ID</span><span className="detail-value">#{faucet.id}</span></div>
                        <div className="detail-item"><span className="detail-label">Amount Per Claim</span><span className="detail-value">{formatTokenAmount(faucet.amountPerClaim, d)} {tokenInfo?.symbol ?? ''}</span></div>
                        <div className="detail-item"><span className="detail-label">Cooldown</span><span className="detail-value">{getCooldownLabel(faucet.cooldownSeconds)}</span></div>
                        <div className="detail-item"><span className="detail-label">Token Address</span><span className="detail-value mono">{tokenHex ? `${tokenHex.slice(0, 10)}...${tokenHex.slice(-8)}` : 'N/A'}</span></div>
                        <div className="detail-item"><span className="detail-label">Creator</span><span className="detail-value mono">{faucet.creator.toHex().slice(0, 10)}...{faucet.creator.toHex().slice(-8)}</span></div>
                    </div>
                </div>
                <div className="faucet-detail-actions">
                    <ClaimButton faucetId={faucet.id} active={faucet.active} cooldownSeconds={faucet.cooldownSeconds} amountPerClaim={faucet.amountPerClaim} onClaimed={refetch} />
                </div>
            </div>
        </div>
    );
}

export function FaucetDetail(): React.JSX.Element {
    const { id } = useParams<{ id: string }>();
    const faucetId = id ? parseInt(id, 10) : null;
    const { faucet, loading, error, refetch } = useFaucet(faucetId);

    if (loading) return <div className="faucet-detail-wrapper"><div className="loading-state">Loading faucet...</div></div>;
    if (error) return (
        <div className="faucet-detail-wrapper"><div className="error-state">
            <p>Error: {error}</p><Link to="/" className="btn">Back to Faucets</Link>
        </div></div>
    );
    if (!faucet) return (
        <div className="faucet-detail-wrapper"><div className="empty-state">
            <p>Faucet not found.</p><Link to="/" className="btn">Back to Faucets</Link>
        </div></div>
    );

    return <FaucetDetailInner faucet={faucet} refetch={refetch} />;
}
