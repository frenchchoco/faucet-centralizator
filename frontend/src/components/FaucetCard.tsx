import { useCallback } from 'react';
import type React from 'react';
import { Link } from 'react-router-dom';
import type { FaucetData } from '../hooks/useFaucets.js';
import { useTokenInfo } from '../hooks/useTokenInfo.js';
import { useHoloTilt } from '../hooks/useHoloTilt.js';
import { useClaimParticles } from '../hooks/useClaimParticles.js';
import { ClaimButton } from './ClaimButton.js';
import { getCooldownLabel, formatTokenAmount } from '../utils/format.js';

export function FaucetCard({ faucet, onClaimed }: { faucet: FaucetData; onClaimed?: () => void }): React.JSX.Element {
    const { tokenInfo } = useTokenInfo(faucet.tokenAddress.toHex());
    const d = tokenInfo?.decimals ?? 8;
    const progress = faucet.totalDeposited > 0n ? Number((faucet.remainingBalance * 100n) / faucet.totalDeposited) : 0;

    const { cardRef, glareRef, handleMouseMove, handleMouseLeave } = useHoloTilt();
    const { containerRef, burst } = useClaimParticles();

    // Merge refs — both point at the same div
    const setRefs = useCallback((el: HTMLDivElement | null) => {
        (cardRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    }, [cardRef, containerRef]);

    const handleClaimed = useCallback(() => {
        burst();
        onClaimed?.();
    }, [burst, onClaimed]);

    return (
        <div
            ref={setRefs}
            className={`faucet-card holo-card${faucet.active ? '' : ' faucet-card-depleted'}`}
            onMouseMove={faucet.active ? handleMouseMove : undefined}
            onMouseLeave={faucet.active ? handleMouseLeave : undefined}
        >
            {/* Holographic glare overlay */}
            <div ref={glareRef} className="holo-glare" />

            {/* Prismatic edge shimmer */}
            {faucet.active && <div className="holo-edge" />}

            {!faucet.active && <div className="depleted-overlay"><span className="depleted-label">DEPLETED</span></div>}

            <Link to={`/faucet/${faucet.id}`} className="faucet-card-link">
                <div className="faucet-card-header">
                    <h3 className="faucet-token-name">
                        {tokenInfo ? `${tokenInfo.name} (${tokenInfo.symbol})` : 'Loading...'}
                    </h3>
                    <span className={`badge ${faucet.active ? 'badge-active' : 'badge-depleted'}`}>
                        {faucet.active ? 'Active' : 'Depleted'}
                    </span>
                </div>
                <div className="faucet-progress">
                    <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="progress-text">
                        {formatTokenAmount(faucet.remainingBalance, d)} / {formatTokenAmount(faucet.totalDeposited, d)}
                    </span>
                </div>
                <div className="faucet-details">
                    <div className="detail-row">
                        <span className="detail-label">Per Claim:</span>
                        <span className="detail-value">{formatTokenAmount(faucet.amountPerClaim, d)} {tokenInfo?.symbol ?? ''}</span>
                    </div>
                    <div className="detail-row">
                        <span className="detail-label">Cooldown:</span>
                        <span className="detail-value">{getCooldownLabel(faucet.cooldownSeconds)}</span>
                    </div>
                </div>
            </Link>
            <ClaimButton faucetId={faucet.id} active={faucet.active} cooldownSeconds={faucet.cooldownSeconds} onClaimed={handleClaimed} />
        </div>
    );
}
