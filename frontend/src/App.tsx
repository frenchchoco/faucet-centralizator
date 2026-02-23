import type React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { WalletConnectProvider } from '@btc-vision/walletconnect';
import { Header } from './components/Header.js';
import { FaucetGrid } from './components/FaucetGrid.js';
import { CreateFaucetForm } from './components/CreateFaucetForm.js';
import { FaucetDetail } from './components/FaucetDetail.js';
import { ToastProvider } from './components/Toast.js';

export function App(): React.JSX.Element {
    return (
        <WalletConnectProvider theme="dark">
            <ToastProvider>
                <BrowserRouter>
                    <Header />
                    <main className="main-content">
                        <Routes>
                            <Route path="/" element={<FaucetGrid />} />
                            <Route path="/create" element={<CreateFaucetForm />} />
                            <Route path="/faucet/:id" element={<FaucetDetail />} />
                        </Routes>
                    </main>
                    <footer className="site-footer">
                        <span>Built on <a href="https://opnet.org" target="_blank" rel="noopener">OPNet</a> · Bitcoin Layer 1</span>
                        <a href="https://github.com/frenchchoco/faucet-centralizator" target="_blank" rel="noopener">GitHub</a>
                    </footer>
                </BrowserRouter>
            </ToastProvider>
        </WalletConnectProvider>
    );
}
