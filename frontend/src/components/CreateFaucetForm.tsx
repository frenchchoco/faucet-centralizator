import type React from 'react';
import { useState } from 'react';
import { getContract, OP_20_ABI } from 'opnet';
import type { IOP20Contract, TransactionParameters } from 'opnet';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { Address } from '@btc-vision/transaction';
import { TokenInfo } from './TokenInfo.js';
import { useTokenInfo } from '../hooks/useTokenInfo.js';
import { FAUCET_MANAGER_ABI } from '../abi/FaucetManagerABI.js';
import type { IFaucetManagerContract } from '../abi/FaucetManagerABI.js';
import { FAUCET_MANAGER_ADDRESS } from '../config/contracts.js';
import { CURRENT_NETWORK } from '../config/networks.js';
import { getProvider } from '../services/ProviderService.js';

const COOLDOWN_OPTIONS = [
    { value: 0, label: 'One-shot (single claim)' },
    { value: 1, label: 'Hourly (3600s)' },
    { value: 2, label: '6 Hours (21600s)' },
    { value: 3, label: '12 Hours (43200s)' },
    { value: 4, label: 'Daily (86400s)' },
];

function parseAmount(value: string, decimals: number): bigint {
    if (!value || value === '0') return 0n;

    const parts = value.split('.');
    const whole = parts[0] ?? '0';
    let frac = parts[1] ?? '';

    // Pad or truncate fractional part to match decimals
    if (frac.length > decimals) {
        frac = frac.slice(0, decimals);
    } else {
        frac = frac.padEnd(decimals, '0');
    }

    return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac);
}

export function CreateFaucetForm(): React.JSX.Element {
    const { walletAddress } = useWalletConnect();

    const [tokenAddress, setTokenAddress] = useState('');
    const [totalAmount, setTotalAmount] = useState('');
    const [amountPerClaim, setAmountPerClaim] = useState('');
    const [cooldownType, setCooldownType] = useState(4); // default Daily

    const [step, setStep] = useState<'approve' | 'create'>('approve');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const { tokenInfo } = useTokenInfo(tokenAddress || null);
    const decimals = tokenInfo?.decimals ?? 8;

    const buildTxParams = (): TransactionParameters => ({
        signer: null,
        mldsaSigner: null,
        refundTo: walletAddress!,
        maximumAllowedSatToSpend: 100_000n,
        feeRate: 10,
        network: CURRENT_NETWORK,
    });

    const handleApprove = async (): Promise<void> => {
        if (!walletAddress) {
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
            );

            const faucetManagerAddress = Address.fromString(FAUCET_MANAGER_ADDRESS);

            // Simulate approve
            const approveResult = await tokenContract.increaseAllowance(
                faucetManagerAddress,
                rawAmount,
            );

            if (approveResult.revert) {
                setError(`Approve simulation reverted: ${approveResult.revert}`);
                return;
            }

            // Send approve transaction
            await approveResult.sendTransaction(buildTxParams());

            setSuccessMessage('Approval confirmed! You can now create the faucet.');
            setStep('create');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Approval failed';
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateFaucet = async (): Promise<void> => {
        if (!walletAddress) {
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
            );

            const tokenAddr = Address.fromString(tokenAddress);

            // Simulate createFaucet
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

            // Send transaction
            const receipt = await simulationResult.sendTransaction(buildTxParams());

            setSuccessMessage(
                `Faucet created successfully! TX: ${receipt.transactionId.slice(0, 16)}...`,
            );

            // Reset form
            setTokenAddress('');
            setTotalAmount('');
            setAmountPerClaim('');
            setCooldownType(4);
            setStep('approve');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Create faucet failed';
            setError(message);
        } finally {
            setLoading(false);
        }
    };

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
                        placeholder="0x..."
                        value={tokenAddress}
                        onChange={(e) => setTokenAddress(e.target.value)}
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
                        <span className={`step ${step === 'approve' ? 'active' : 'done'}`}>
                            Step 1: Approve
                        </span>
                        <span className={`step ${step === 'create' ? 'active' : ''}`}>
                            Step 2: Create
                        </span>
                    </div>

                    {step === 'approve' ? (
                        <button
                            className="btn btn-primary"
                            disabled={loading || !walletAddress}
                            onClick={() => void handleApprove()}
                        >
                            {loading ? 'Approving...' : 'Approve Token'}
                        </button>
                    ) : (
                        <button
                            className="btn btn-primary"
                            disabled={loading || !walletAddress}
                            onClick={() => void handleCreateFaucet()}
                        >
                            {loading ? 'Creating...' : 'Create Faucet'}
                        </button>
                    )}
                </div>

                {error && <p className="form-error">{error}</p>}
                {successMessage && <p className="form-success">{successMessage}</p>}
            </div>
        </div>
    );
}
