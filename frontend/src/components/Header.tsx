import type React from 'react';
import { Link } from 'react-router-dom';
import { WalletConnect } from './WalletConnect.js';

export function Header(): React.JSX.Element {
    return (
        <header className="header">
            <div className="header-inner">
                <Link to="/" className="header-logo">
                    Faucet Centralizator
                </Link>

                <nav className="header-nav">
                    <Link to="/" className="nav-link">
                        Faucets
                    </Link>
                    <Link to="/create" className="nav-link">
                        Create
                    </Link>
                </nav>

                <WalletConnect />
            </div>
        </header>
    );
}
