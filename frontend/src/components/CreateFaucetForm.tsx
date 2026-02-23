import type React from 'react';
import { useState, useEffect, useRef } from 'react';
import { getContract, OP_20_ABI } from 'opnet';
import type { IOP20Contract, TransactionParameters } from 'opnet';
import { useWalletConnect } from '@btc-vision/walletconnect';
import type { Address } from '@btc-vision/transaction';
import { TokenInfo } from './TokenInfo.js';
import { useTokenInfo } from '../hooks/useTokenInfo.js';
import { FAUCET_MANAGER_ABI } from '../abi/FaucetManagerABI.js';
import type { IFaucetManagerContract } from '../abi/FaucetManagerABI.js';
import { FAUCET_MANAGER_ADDRESS } from '../config/contracts.js';
import { CURRENT_NETWORK } from '../config/networks.js';
import { getProvider } from '../services/ProviderService.js';

type Step = 'approve' | 'waiting-approve' | 'create' | 'waiting-create' | 'done';

const COOLDOWN_OPTIONS = [
    { value: 0, label: 'One-shot (single claim)' },
    { value: 1, label: 'Hourly (3600s)' },
    { value: 2, label: '6 Hours (21600s)' },
    { value: 3, label: '12 Hours (43200s)' },
    { value: 4, label: 'Daily (86400s)' },
];

const POLL_INTERVAL_MS = 15_000;
const MAX_POLL_MS = 15 * 60_000; // 15 min max wait

function parseAmount(value: string, decimals: number): bigint {
    if (!value || value === '0') return 0n;

    const parts = value.split('.');
    const whole = parts[0] ?? '0';
    let frac = parts[1] ?? '';

    if (frac.length > decimals) {
        frac = frac.slice(0, decimals);
    } else {
        frac = frac.padEnd(decimals, '0');
    }

    return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac);
}

export function CreateFaucetForm(): React.JSX.Element {
    const { walletAddress, publicKey, address: senderAddress } = useWalletConnect();

    const [tokenAddress, setTokenAddress] = useState('');
    const [totalAmount, setTotalAmount] = useState('');
    const [amountPerClaim, setAmountPerClaim] = useState('');
    const [cooldownType, setCooldownType] = useState(4);

    const [step, setStep] = useState<Step>('approve');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [waitElapsed, setWaitElapsed] = useState(0);
    const [pendingTxId, setPendingTxId] = useState<string | null>(null);
    const [waitLabel, setWaitLabel] = useState('');

    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const { tokenInfo } = useTokenInfo(tokenAddress || null);
    const decimals = tokenInfo?.decimals ?? 8;

    const stopPolling = (): void => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => stopPolling();
    }, []);

    const buildTxParams = (): TransactionParameters => ({
        signer: null,
        mldsaSigner: null,
        refundTo: walletAddress!,
        maximumAllowedSatToSpend: 100_000n,
        feeRate: 10,
        network: CURRENT_NETWORK,
    });

    /**
     * Generic polling helper: starts a timer + interval, calls checkFn every tick.
     * checkFn should return true when the condition is met.
     */
    const startPolling = (checkFn: () => Promise<boolean>, onDone: () => void): void => {
        const startTime = Date.now();
        setWaitElapsed(0);

        timerRef.current = setInterval(() => {
            setWaitElapsed(Math.floor((Date.now() - startTime) / 1000));
        }, 1_000);

        pollingRef.current = setInterval(async () => {
            try {
                const confirmed = await checkFn();
                if (confirmed) {
                    stopPolling();
                    onDone();
                    return;
                }
            } catch {
                // Silently retry
            }

            if (Date.now() - startTime > MAX_POLL_MS) {
                stopPolling();
                onDone(); // Let them proceed anyway after timeout
            }
        }, POLL_INTERVAL_MS);
    };

    // ---- Step 1: Approve ---- //

    const handleApprove = async (): Promise<void> => {
        if (!walletAddress || !publicKey) {
            setError('Connect your wallet first');
            return;
        }

        if (!tokenAddress || !totalAmount) {
            setError('Fill in token address and total amount');
            return;
        }

        setLoading(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const provider = getProvider();
            const rawAmount = parseAmount(totalAmount, decimals);

            const tokenContract = getContract<IOP20Contract>(
                tokenAddress,
                OP_20_ABI,
                provider,
                CURRENT_NETWORK,
                senderAddress ?? undefined,
            );

            const faucetManagerAddr: Address = await provider.getPublicKeyInfo(
                FAUCET_MANAGER_ADDRESS,
                true,
            );

            const approveResult = await tokenContract.increaseAllowance(
                faucetManagerAddr,
                rawAmount,
            );

            if (approveResult.revert) {
                setError(`Approve simulation reverted: ${approveResult.revert}`);
                return;
            }

            const receipt = await approveResult.sendTransaction(buildTxParams());
            setPendingTxId(receipt.transactionId);

            setStep('waiting-approve');
            setWaitLabel('Waiting for approval confirmation');
            setSuccessMessage(
                'Approve TX broadcast! Regtest blocks are ~10 min — waiting for on-chain confirmation...',
            );

            // Poll allowance until confirmed
            startPolling(
                async () => {
                    const p = getProvider();
                    const tc = getContract<IOP20Contract>(
                        tokenAddress,
                        OP_20_ABI,
                        p,
                        CURRENT_NETWORK,
                        senderAddress ?? undefined,
                    );
                    const fma: Address = await p.getPublicKeyInfo(FAUCET_MANAGER_ADDRESS, true);
                    const res = await tc.allowance(senderAddress!, fma);
                    if (!res.revert) {
                        const remaining = res.properties.remaining ?? 0n;
                        return remaining >= rawAmount;
                    }
                    return false;
                },
                () => {
                    setStep('create');
                    setSuccessMessage('Approval confirmed on-chain! You can now create the faucet.');
                },
            );
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Approval failed';
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    // ---- Step 2: Create Faucet ---- //

    const handleCreateFaucet = async (): Promise<void> => {
        if (!walletAddress || !publicKey) {
            setError('Connect your wallet first');
            return;
        }

        if (!tokenAddress || !totalAmount || !amountPerClaim) {
            setError('Fill in all fields');
            return;
        }

        setLoading(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const provider = getProvider();
            const rawTotal = parseAmount(totalAmount, decimals);
            const rawPerClaim = parseAmount(amountPerClaim, decimals);

            const contract = getContract<IFaucetManagerContract>(
                FAUCET_MANAGER_ADDRESS,
                FAUCET_MANAGER_ABI,
                provider,
                CURRENT_NETWORK,
                senderAddress ?? undefined,
            );

            // Snapshot current faucet count before creating
            const countBefore = await contract.getFaucetCount();
            const prevCount = countBefore.properties.count ?? 0n;

            const tokenAddr: Address = await provider.getPublicKeyInfo(tokenAddress, true);

            const simulationResult = await contract.createFaucet(
                tokenAddr,
                rawTotal,
                rawPerClaim,
                cooldownType,
            );

            if (simulationResult.revert) {
                setError(`Create faucet simulation reverted: ${simulationResult.revert}`);
                return;
            }

            const receipt = await simulationResult.sendTransaction(buildTxParams());
            setPendingTxId(receipt.transactionId);

            setStep('waiting-create');
            setWaitLabel('Waiting for faucet creation confirmation');
            setSuccessMessage(
                'Create Faucet TX broadcast! Regtest blocks are ~10 min — waiting for on-chain confirmation...',
            );

            // Poll faucet count until it increases
            startPolling(
                async () => {
                    const p = getProvider();
                    const c = getContract<IFaucetManagerContract>(
                        FAUCET_MANAGER_ADDRESS,
                        FAUCET_MANAGER_ABI,
                        p,
                        CURRENT_NETWORK,
                        senderAddress ?? undefined,
                    );
                    const res = await c.getFaucetCount();
                    if (!res.revert) {
                        const newCount = res.properties.count ?? 0n;
                        return newCount > prevCount;
                    }
                    return false;
                },
                () => {
                    setStep('done');
                    setSuccessMessage('Faucet created and confirmed on-chain!');
                },
            );
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Create faucet failed';
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    // ---- Reset to create another faucet ---- //

    const handleReset = (): void => {
        setTokenAddress('');
        setTotalAmount('');
        setAmountPerClaim('');
        setCooldownType(4);
        setStep('approve');
        setPendingTxId(null);
        setError(null);
        setSuccessMessage(null);
    };

    const formatElapsed = (seconds: number): string => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return m > 0 ? `${m}m ${s}s` : `${s}s`;
    };

    const isWaiting = step === 'waiting-approve' || step === 'waiting-create';
    const formLocked = step !== 'approve';
    const approveReady =
        !!walletAddress && !!tokenAddress && !!tokenInfo && !!totalAmount && !!amountPerClaim;

    return (
        <div className="create-faucet-wrapper">
            <h2 className="page-title">Create a Faucet</h2>

            <div className="form-card">
                <div className="form-group">
                    <label className="form-label" htmlFor="token-address">
                        Token Contract Address
                    </label>
                    <input
                        id="token-address"
                        className="form-input"
                        type="text"
                        placeholder="opr1s..."
                        value={tokenAddress}
                        onChange={(e) => setTokenAddress(e.target.value)}
                        disabled={formLocked}
                    />
                    <TokenInfo address={tokenAddress || null} />
                </div>

                <div className="form-group">
                    <label className="form-label" htmlFor="total-amount">
                        Total Amount (human-readable)
                    </label>
                    <input
                        id="total-amount"
                        className="form-input"
                        type="text"
                        placeholder="e.g. 1000"
                        value={totalAmount}
                        onChange={(e) => setTotalAmount(e.target.value)}
                        disabled={formLocked}
                    />
                </div>

                <div className="form-group">
                    <label className="form-label" htmlFor="per-claim">
                        Amount Per Claim (human-readable)
                    </label>
                    <input
                        id="per-claim"
                        className="form-input"
                        type="text"
                        placeholder="e.g. 10"
                        value={amountPerClaim}
                        onChange={(e) => setAmountPerClaim(e.target.value)}
                        disabled={formLocked}
                    />
                </div>

                <div className="form-group">
                    <label className="form-label" htmlFor="cooldown-type">
                        Cooldown Type
                    </label>
                    <select
                        id="cooldown-type"
                        className="form-select"
                        value={cooldownType}
                        onChange={(e) => setCooldownType(Number(e.target.value))}
                        disabled={formLocked}
                    >
                        {COOLDOWN_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="form-actions">
                    <div className="step-indicator">
                        <span
                            className={`step ${step === 'approve' ? 'active' : 'done'}`}
                        >
                            Step 1: Approve
                        </span>
                        <span
                            className={`step ${step === 'create' || step === 'waiting-create' || step === 'done' ? 'active' : ''}`}
                        >
                            Step 2: Create
                        </span>
                    </div>

                    {step === 'approve' && (
                        <button
                            className="btn btn-primary"
                            disabled={loading || !approveReady}
                            onClick={() => void handleApprove()}
                        >
                            {loading ? 'Approving...' : 'Approve Token'}
                        </button>
                    )}

                    {isWaiting && (
                        <div className="waiting-state">
                            <p className="waiting-text">
                                {waitLabel}... ({formatElapsed(waitElapsed)})
                            </p>
                            {pendingTxId && (
                                <p className="waiting-txid">
                                    TX: {pendingTxId.slice(0, 16)}...
                                </p>
                            )}
                            <div className="waiting-spinner" />
                        </div>
                    )}

                    {step === 'create' && (
                        <button
                            className="btn btn-primary"
                            disabled={loading || !walletAddress}
                            onClick={() => void handleCreateFaucet()}
                        >
                            {loading ? 'Creating...' : 'Create Faucet'}
                        </button>
                    )}

                    {step === 'done' && (
                        <button className="btn btn-primary" onClick={handleReset}>
                            Create Another Faucet
                        </button>
                    )}
                </div>

                {error && <p className="form-error">{error}</p>}
                {successMessage && <p className="form-success">{successMessage}</p>}
            </div>
        </div>
    );
}
