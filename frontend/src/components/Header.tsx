import type React from 'react';
import { Link } from 'react-router-dom';
import { WalletConnect } from './WalletConnect.js';

/**
 * Faucet + hub logo — a stylized tap with droplets forming a network.
 * The handle doubles as a "centralizer" hub with radiating connections.
 */
function Logo(): React.JSX.Element {
    return (
        <svg
            className="header-logo-icon"
            viewBox="0 0 36 36"
            width="28"
            height="28"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            <defs>
                <linearGradient id="lg" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#00f0ff" />
                    <stop offset="50%" stopColor="#b94dff" />
                    <stop offset="100%" stopColor="#ff2daa" />
                </linearGradient>
            </defs>
            {/* Faucet body — pipe */}
            <rect x="10" y="8" width="16" height="5" rx="2.5" fill="url(#lg)" />
            {/* Faucet spout — angled down */}
            <path d="M22 10.5h4a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1.5" stroke="url(#lg)" strokeWidth="2.2" strokeLinecap="round" fill="none" />
            {/* Handle / Hub — central circle */}
            <circle cx="18" cy="8" r="3.5" stroke="url(#lg)" strokeWidth="1.8" fill="none" />
            <circle cx="18" cy="8" r="1.2" fill="url(#lg)" />
            {/* Hub radiating lines */}
            <line x1="18" y1="4.5" x2="18" y2="2" stroke="url(#lg)" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="21.2" y1="6" x2="23" y2="4.2" stroke="url(#lg)" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="14.8" y1="6" x2="13" y2="4.2" stroke="url(#lg)" strokeWidth="1.2" strokeLinecap="round" />
            {/* Droplets — cascade from spout */}
            <circle cx="24.5" cy="21" r="1.8" fill="url(#lg)" opacity="0.9" />
            <circle cx="24.5" cy="26" r="1.3" fill="url(#lg)" opacity="0.6" />
            <circle cx="24.5" cy="30" r="0.9" fill="url(#lg)" opacity="0.35" />
            {/* Node connections between drops — "centralized network" */}
            <line x1="24.5" y1="22.8" x2="24.5" y2="24.7" stroke="url(#lg)" strokeWidth="0.7" opacity="0.4" />
            <line x1="24.5" y1="27.3" x2="24.5" y2="29.1" stroke="url(#lg)" strokeWidth="0.7" opacity="0.25" />
        </svg>
    );
}

export function Header(): React.JSX.Element {
    return (
        <header className="header">
            <div className="header-inner">
                <Link to="/" className="header-logo">
                    <Logo />
                    <span>Faucet Centralizator</span>
                </Link>
                <nav className="header-nav">
                    <Link to="/" className="nav-link">Faucets</Link>
                    <Link to="/create" className="nav-link">Create</Link>
                </nav>
                <WalletConnect />
            </div>
        </header>
    );
}
