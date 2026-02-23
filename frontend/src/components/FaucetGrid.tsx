import type React from 'react';
import { useFaucets } from '../hooks/useFaucets.js';
import { FaucetCard } from './FaucetCard.js';

export function FaucetGrid(): React.JSX.Element {
    const { faucets, loading, error, refetch } = useFaucets();

    return (
        <div className="faucet-grid-wrapper">
            <h2 className="page-title">Available Faucets</h2>
            {loading ? <div className="loading-state">Loading faucets...</div>
                : error ? <div className="error-state"><p>Error: {error}</p><button className="btn" onClick={refetch}>Retry</button></div>
                : faucets.length === 0 ? <div className="empty-state"><p>No faucets yet. Be the first to create one!</p></div>
                : <div className="faucet-grid">{faucets.map((f) => <FaucetCard key={f.id} faucet={f} onClaimed={refetch} />)}</div>}
        </div>
    );
}
