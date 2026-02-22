import type React from 'react';
import { useFaucets } from '../hooks/useFaucets.js';
import { FaucetCard } from './FaucetCard.js';

export function FaucetGrid(): React.JSX.Element {
    const { faucets, loading, error, refetch } = useFaucets();

    if (loading) {
        return (
            <div className="faucet-grid-wrapper">
                <h2 className="page-title">Available Faucets</h2>
                <div className="loading-state">Loading faucets...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="faucet-grid-wrapper">
                <h2 className="page-title">Available Faucets</h2>
                <div className="error-state">
                    <p>Error: {error}</p>
                    <button className="btn" onClick={refetch}>
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (faucets.length === 0) {
        return (
            <div className="faucet-grid-wrapper">
                <h2 className="page-title">Available Faucets</h2>
                <div className="empty-state">
                    <p>No faucets have been created yet.</p>
                    <p>Be the first to create one!</p>
                </div>
            </div>
        );
    }

    return (
        <div className="faucet-grid-wrapper">
            <h2 className="page-title">Available Faucets</h2>
            <div className="faucet-grid">
                {faucets.map((faucet) => (
                    <FaucetCard key={faucet.id} faucet={faucet} onClaimed={refetch} />
                ))}
            </div>
        </div>
    );
}
