import type React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { WalletConnectProvider } from '@btc-vision/walletconnect';
import { Header } from './components/Header.js';
import { FaucetGrid } from './components/FaucetGrid.js';
import { CreateFaucetForm } from './components/CreateFaucetForm.js';
import { FaucetDetail } from './components/FaucetDetail.js';

export function App(): React.JSX.Element {
    return (
        <WalletConnectProvider theme="dark">
            <BrowserRouter>
                <Header />
                <main className="main-content">
                    <Routes>
                        <Route path="/" element={<FaucetGrid />} />
                        <Route path="/create" element={<CreateFaucetForm />} />
                        <Route path="/faucet/:id" element={<FaucetDetail />} />
                    </Routes>
                </main>
            </BrowserRouter>
        </WalletConnectProvider>
    );
}
