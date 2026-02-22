import type React from 'react';
import { Link } from 'react-router-dom';
import type { FaucetData } from '../hooks/useFaucets.js';
import { useTokenInfo } from '../hooks/useTokenInfo.js';
import { ClaimButton } from './ClaimButton.js';

interface FaucetCardProps {
    faucet: FaucetData;
    onClaimed?: () => void;
}

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

export function FaucetCard({ faucet, onClaimed }: FaucetCardProps): React.JSX.Element {
    const tokenAddressHex = faucet.tokenAddress.toHex();
    const { tokenInfo } = useTokenInfo(tokenAddressHex);

    const decimals = tokenInfo?.decimals ?? 8;
    const totalFormatted = formatTokenAmount(faucet.totalDeposited, decimals);
    const remainingFormatted = formatTokenAmount(faucet.remainingBalance, decimals);
    const perClaimFormatted = formatTokenAmount(faucet.amountPerClaim, decimals);

    const progressPercent =
        faucet.totalDeposited > 0n
            ? Number((faucet.remainingBalance * 100n) / faucet.totalDeposited)
            : 0;

    return (
        <div className="faucet-card">
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
                        <div
                            className="progress-fill"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                    <span className="progress-text">
                        {remainingFormatted} / {totalFormatted}
                    </span>
                </div>

                <div className="faucet-details">
                    <div className="detail-row">
                        <span className="detail-label">Per Claim:</span>
                        <span className="detail-value">
                            {perClaimFormatted} {tokenInfo?.symbol ?? ''}
                        </span>
                    </div>
                    <div className="detail-row">
                        <span className="detail-label">Cooldown:</span>
                        <span className="detail-value">
                            {getCooldownLabel(faucet.cooldownSeconds)}
                        </span>
                    </div>
                </div>
            </Link>

            <ClaimButton
                faucetId={faucet.id}
                active={faucet.active}
                cooldownSeconds={faucet.cooldownSeconds}
                onClaimed={onClaimed}
            />
        </div>
    );
}
