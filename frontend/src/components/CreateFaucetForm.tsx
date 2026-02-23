import type React from 'react';
import { useState, useEffect, useRef } from 'react';
import { getContract, OP_20_ABI } from 'opnet';
import type { IOP20Contract, TransactionParameters } from 'opnet';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { TokenInfo } from './TokenInfo.js';
import { useTokenInfo } from '../hooks/useTokenInfo.js';
import { FAUCET_MANAGER_ABI } from '../abi/FaucetManagerABI.js';
import type { IFaucetManagerContract } from '../abi/FaucetManagerABI.js';
import { FAUCET_MANAGER_ADDRESS } from '../config/contracts.js';
import { CURRENT_NETWORK } from '../config/networks.js';
import { getProvider } from '../services/ProviderService.js';
import { parseAmount, formatTime } from '../utils/format.js';

type Step = 'approve' | 'waiting-approve' | 'create' | 'waiting-create' | 'done';

const COOLDOWN_OPTIONS = [
    { value: 0, label: 'One-shot (single claim)' },
    { value: 1, label: 'Hourly (3600s)' },
    { value: 2, label: '6 Hours (21600s)' },
    { value: 3, label: '12 Hours (43200s)' },
    { value: 4, label: 'Daily (86400s)' },
];
const POLL_MS = 15_000;
const MAX_WAIT_MS = 15 * 60_000;

export function CreateFaucetForm(): React.JSX.Element {
    const { walletAddress, address: senderAddress } = useWalletConnect();
    const [tokenAddress, setTokenAddress] = useState('');
    const [totalAmount, setTotalAmount] = useState('');
    const [amountPerClaim, setAmountPerClaim] = useState('');
    const [cooldownType, setCooldownType] = useState(4);
    const [step, setStep] = useState<Step>('approve');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [waitElapsed, setWaitElapsed] = useState(0);
    const [pendingTxId, setPendingTxId] = useState<string | null>(null);
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const { tokenInfo } = useTokenInfo(tokenAddress || null);
    const decimals = tokenInfo?.decimals ?? 8;

    const provider = getProvider();
    const network = CURRENT_NETWORK;

    const stopPolling = () => {
        if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };

    useEffect(() => () => stopPolling(), []);

    const getFaucetManagerAddr = () => provider.getPublicKeyInfo(FAUCET_MANAGER_ADDRESS, true);

    const getTokenContract = () =>
        getContract<IOP20Contract>(tokenAddress, OP_20_ABI, provider, network, senderAddress ?? undefined);

    const checkAllowance = async (rawAmount: bigint): Promise<boolean> => {
        const res = await getTokenContract().allowance(senderAddress!, await getFaucetManagerAddr());
        return !res.revert && (res.properties.remaining ?? 0n) >= rawAmount;
    };

    useEffect(() => {
        if (step !== 'approve' || !senderAddress || !tokenAddress || !totalAmount || !amountPerClaim || !tokenInfo) return;
        let cancelled = false;
        (async () => {
            try {
                const rawAmount = parseAmount(totalAmount, tokenInfo.decimals);
                if (rawAmount <= 0n) return;
                if (!cancelled && await checkAllowance(rawAmount)) {
                    setStep('create');
                    setSuccessMsg('Existing approval detected. You can create the faucet directly!');
                }
            } catch { /* ignore */ }
        })();
        return () => { cancelled = true; };
    }, [step, senderAddress, tokenAddress, totalAmount, amountPerClaim, tokenInfo]);

    const buildTxParams = (): TransactionParameters => ({
        signer: null, mldsaSigner: null, refundTo: walletAddress!,
        maximumAllowedSatToSpend: 100_000n, network: CURRENT_NETWORK,
    });

    const startPolling = (checkFn: () => Promise<boolean>, onDone: () => void) => {
        const t0 = Date.now();
        setWaitElapsed(0);
        timerRef.current = setInterval(() => setWaitElapsed(Math.floor((Date.now() - t0) / 1000)), 1_000);
        pollingRef.current = setInterval(async () => {
            try { if (await checkFn()) { stopPolling(); onDone(); return; } } catch { /* retry */ }
            if (Date.now() - t0 > MAX_WAIT_MS) { stopPolling(); onDone(); }
        }, POLL_MS);
    };

    const handleApprove = async () => {
        if (!walletAddress) { setError('Connect your wallet first'); return; }
        if (!tokenAddress || !totalAmount) { setError('Fill in token address and total amount'); return; }
        setLoading(true); setError(null); setSuccessMsg(null);
        try {
            const rawAmount = parseAmount(totalAmount, decimals);
            const sim = await getTokenContract().increaseAllowance(await getFaucetManagerAddr(), rawAmount);
            if (sim.revert) { setError(`Approve reverted: ${sim.revert}`); return; }
            const receipt = await sim.sendTransaction(buildTxParams());
            setPendingTxId(receipt.transactionId);
            setStep('waiting-approve');
            setSuccessMsg('Approve TX broadcast! Waiting for confirmation...');
            startPolling(() => checkAllowance(rawAmount), () => {
                setStep('create');
                setSuccessMsg('Approval confirmed! You can now create the faucet.');
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Approval failed');
        } finally { setLoading(false); }
    };

    const handleCreateFaucet = async () => {
        if (!walletAddress) { setError('Connect your wallet first'); return; }
        if (!tokenAddress || !totalAmount || !amountPerClaim) { setError('Fill in all fields'); return; }
        setLoading(true); setError(null); setSuccessMsg(null);
        try {
            const contract = getContract<IFaucetManagerContract>(
                FAUCET_MANAGER_ADDRESS, FAUCET_MANAGER_ABI, provider, network, senderAddress ?? undefined,
            );
            const prevCount = (await contract.getFaucetCount()).properties.count ?? 0n;
            const tokenAddr = await provider.getPublicKeyInfo(tokenAddress, true);
            const sim = await contract.createFaucet(
                tokenAddr, parseAmount(totalAmount, decimals), parseAmount(amountPerClaim, decimals), cooldownType,
            );
            if (sim.revert) { setError(`Create reverted: ${sim.revert}`); return; }
            const receipt = await sim.sendTransaction(buildTxParams());
            setPendingTxId(receipt.transactionId);
            setStep('waiting-create');
            setSuccessMsg('Create TX broadcast! Waiting for confirmation...');
            startPolling(async () => {
                const c = getContract<IFaucetManagerContract>(
                    FAUCET_MANAGER_ADDRESS, FAUCET_MANAGER_ABI, provider, network, senderAddress ?? undefined,
                );
                const res = await c.getFaucetCount();
                return !res.revert && (res.properties.count ?? 0n) > prevCount;
            }, () => { setStep('done'); setSuccessMsg('Faucet created and confirmed on-chain!'); });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Create faucet failed');
        } finally { setLoading(false); }
    };

    const handleReset = () => {
        setTokenAddress(''); setTotalAmount(''); setAmountPerClaim('');
        setCooldownType(4); setStep('approve'); setPendingTxId(null);
        setError(null); setSuccessMsg(null);
    };

    const isWaiting = step === 'waiting-approve' || step === 'waiting-create';
    const formLocked = step !== 'approve';
    const approveReady = !!walletAddress && !!tokenAddress && !!tokenInfo && !!totalAmount && !!amountPerClaim;
    const waitLabel = step === 'waiting-approve' ? 'Waiting for approval confirmation' : 'Waiting for faucet creation confirmation';

    return (
        <div className="create-faucet-wrapper">
            <h2 className="page-title">Create a Faucet</h2>
            <div className="form-card">
                <div className="form-group">
                    <label className="form-label" htmlFor="token-address">Token Contract Address</label>
                    <input id="token-address" className="form-input" type="text" placeholder="opt1s..."
                        value={tokenAddress} onChange={(e) => setTokenAddress(e.target.value)} disabled={formLocked} />
                    <TokenInfo address={tokenAddress || null} />
                </div>
                <div className="form-group">
                    <label className="form-label" htmlFor="total-amount">Total Amount</label>
                    <input id="total-amount" className="form-input" type="text" placeholder="e.g. 1000"
                        value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} disabled={formLocked} />
                </div>
                <div className="form-group">
                    <label className="form-label" htmlFor="per-claim">Amount Per Claim</label>
                    <input id="per-claim" className="form-input" type="text" placeholder="e.g. 10"
                        value={amountPerClaim} onChange={(e) => setAmountPerClaim(e.target.value)} disabled={formLocked} />
                </div>
                <div className="form-group">
                    <label className="form-label" htmlFor="cooldown-type">Cooldown Type</label>
                    <select id="cooldown-type" className="form-select" value={cooldownType}
                        onChange={(e) => setCooldownType(Number(e.target.value))} disabled={formLocked}>
                        {COOLDOWN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </div>
                <div className="form-actions">
                    <div className="step-indicator">
                        <span className={`step ${step === 'approve' ? 'active' : 'done'}`}>Step 1: Approve</span>
                        <span className={`step ${step === 'create' || step === 'waiting-create' || step === 'done' ? 'active' : ''}`}>Step 2: Create</span>
                    </div>
                    {step === 'approve' && (
                        <button className="btn btn-primary" disabled={loading || !approveReady} onClick={() => void handleApprove()}>
                            {loading ? 'Approving...' : 'Approve Token'}
                        </button>
                    )}
                    {isWaiting && (
                        <div className="waiting-state">
                            <p className="waiting-text">{waitLabel}... ({formatTime(waitElapsed)})</p>
                            {pendingTxId && <p className="waiting-txid">TX: {pendingTxId.slice(0, 16)}...</p>}
                            <div className="waiting-spinner" />
                        </div>
                    )}
                    {step === 'create' && (
                        <button className="btn btn-primary" disabled={loading || !walletAddress} onClick={() => void handleCreateFaucet()}>
                            {loading ? 'Creating...' : 'Create Faucet'}
                        </button>
                    )}
                    {step === 'done' && <button className="btn btn-primary" onClick={handleReset}>Create Another Faucet</button>}
                </div>
                {error && <p className="form-error">{error}</p>}
                {successMsg && <p className="form-success">{successMsg}</p>}
            </div>
        </div>
    );
}
