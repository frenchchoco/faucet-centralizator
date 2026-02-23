import type React from 'react';
import { Link } from 'react-router-dom';
import { useFaucets } from '../hooks/useFaucets.js';
import { FaucetCard } from './FaucetCard.js';

function SkeletonCard(): React.JSX.Element {
    return (
        <div className="faucet-card skeleton-card">
            <div className="skeleton-line skeleton-title" />
            <div className="skeleton-line skeleton-bar" />
            <div className="skeleton-line skeleton-text" />
            <div className="skeleton-line skeleton-text short" />
            <div className="skeleton-line skeleton-btn" />
        </div>
    );
}

export function FaucetGrid(): React.JSX.Element {
    const { faucets, loading, error, refetch } = useFaucets();

    return (
        <div className="faucet-grid-wrapper">
            <section className="hero">
                <h1 className="hero-title">Claim Free OP20 Tokens on Bitcoin</h1>
                <p className="hero-subtitle">
                    Anyone can create a faucet for any token. Fully on-chain, no admin keys, powered by OPNet.
                </p>
                <div className="hero-actions">
                    <a href="#faucets" className="btn btn-connect">Browse Faucets</a>
                    <Link to="/create" className="btn btn-primary hero-btn">Create a Faucet</Link>
                </div>
            </section>

            <h2 className="page-title" id="faucets">Available Faucets</h2>

            {loading ? (
                <div className="faucet-grid">
                    <SkeletonCard /><SkeletonCard /><SkeletonCard />
                </div>
            ) : error ? (
                <div className="error-state">
                    <p>Error: {error}</p>
                    <button className="btn" onClick={refetch}>Retry</button>
                </div>
            ) : faucets.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon">🚰</div>
                    <p>No faucets yet.</p>
                    <p className="empty-hint">Be the first to create one!</p>
                    <Link to="/create" className="btn btn-primary" style={{ marginTop: '1rem', display: 'inline-block' }}>Create a Faucet</Link>
                </div>
            ) : (
                <div className="faucet-grid">
                    {faucets.map((f) => <FaucetCard key={f.id} faucet={f} onClaimed={refetch} />)}
                </div>
            )}
        </div>
    );
}
