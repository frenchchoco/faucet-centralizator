import type React from 'react';
import { Link } from 'react-router-dom';
import type { FaucetData } from '../hooks/useFaucets.js';
import { useTokenInfo } from '../hooks/useTokenInfo.js';
import { ClaimButton } from './ClaimButton.js';
import { getCooldownLabel, formatTokenAmount } from '../utils/format.js';

export function FaucetCard({ faucet, onClaimed }: { faucet: FaucetData; onClaimed?: () => void }): React.JSX.Element {
    const { tokenInfo } = useTokenInfo(faucet.tokenAddress.toHex());
    const d = tokenInfo?.decimals ?? 8;
    const progress = faucet.totalDeposited > 0n ? Number((faucet.remainingBalance * 100n) / faucet.totalDeposited) : 0;

    return (
        <div className={`faucet-card${faucet.active ? '' : ' faucet-card-depleted'}`}>
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
            <ClaimButton faucetId={faucet.id} active={faucet.active} cooldownSeconds={faucet.cooldownSeconds} onClaimed={onClaimed} />
        </div>
    );
}
