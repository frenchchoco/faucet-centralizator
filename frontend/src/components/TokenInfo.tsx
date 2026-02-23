import type React from 'react';
import { useTokenInfo } from '../hooks/useTokenInfo.js';

export function TokenInfo({ address }: { address: string | null }): React.JSX.Element | null {
    const { tokenInfo, loading, error } = useTokenInfo(address);
    if (!address || address.length < 10) return null;
    if (loading) return <div className="token-info loading">Loading token info...</div>;
    if (error) return <div className="token-info error">Error: {error}</div>;
    if (!tokenInfo) return null;
    return (
        <div className="token-info">
            <span className="token-name">{tokenInfo.name}</span>
            <span className="token-symbol">({tokenInfo.symbol})</span>
            <span className="token-decimals">{tokenInfo.decimals} decimals</span>
        </div>
    );
}
