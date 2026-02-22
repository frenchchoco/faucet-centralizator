import type React from 'react';
import { useWalletConnect, SupportedWallets } from '@btc-vision/walletconnect';

export function WalletConnect(): React.JSX.Element {
    const { walletAddress, connecting, connectToWallet, disconnect } = useWalletConnect();

    if (walletAddress) {
        const shortened = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;

        return (
            <div className="wallet-connected">
                <span className="wallet-address" title={walletAddress}>
                    {shortened}
                </span>
                <button className="btn btn-disconnect" onClick={disconnect}>
                    Disconnect
                </button>
            </div>
        );
    }

    return (
        <button
            className="btn btn-connect"
            disabled={connecting}
            onClick={() => connectToWallet(SupportedWallets.OP_WALLET)}
        >
            {connecting ? 'Connecting...' : 'Connect Wallet'}
        </button>
    );
}
