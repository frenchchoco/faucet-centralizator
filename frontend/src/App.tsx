import { BrowserRouter, Routes, Route } from 'react-router-dom';

export function App(): JSX.Element {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<div className="placeholder">Free Faucet - Coming Soon</div>} />
            </Routes>
        </BrowserRouter>
    );
}
