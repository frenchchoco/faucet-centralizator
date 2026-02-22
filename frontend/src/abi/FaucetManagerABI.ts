import { ABIDataTypes, BitcoinAbiTypes, type BitcoinInterfaceAbi } from 'opnet';
import type { CallResult, BaseContractProperties } from 'opnet';
import type { Address } from '@btc-vision/transaction';

// ---- Result types for typed contract calls ---- //

export type CreateFaucetResult = CallResult<{
    faucetId: bigint;
}>;

export type ClaimResult = CallResult<{
    success: boolean;
}>;

export type GetFaucetResult = CallResult<{
    tokenAddress: Address;
    creator: Address;
    totalDeposited: bigint;
    remainingBalance: bigint;
    amountPerClaim: bigint;
    cooldownSeconds: bigint;
    active: boolean;
}>;

export type GetFaucetCountResult = CallResult<{
    count: bigint;
}>;

// ---- Contract interface ---- //

export interface IFaucetManagerContract extends BaseContractProperties {
    createFaucet(
        token: Address,
        totalAmount: bigint,
        amountPerClaim: bigint,
        cooldownType: number,
    ): Promise<CreateFaucetResult>;

    claim(faucetId: bigint): Promise<ClaimResult>;

    getFaucet(faucetId: bigint): Promise<GetFaucetResult>;

    getFaucetCount(): Promise<GetFaucetCountResult>;
}

// ---- ABI definition ---- //

export const FAUCET_MANAGER_ABI: BitcoinInterfaceAbi = [
    {
        name: 'createFaucet',
        inputs: [
            { name: 'token', type: ABIDataTypes.ADDRESS },
            { name: 'totalAmount', type: ABIDataTypes.UINT256 },
            { name: 'amountPerClaim', type: ABIDataTypes.UINT256 },
            { name: 'cooldownType', type: ABIDataTypes.UINT8 },
        ],
        outputs: [{ name: 'faucetId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'claim',
        inputs: [{ name: 'faucetId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getFaucet',
        constant: true,
        inputs: [{ name: 'faucetId', type: ABIDataTypes.UINT256 }],
        outputs: [
            { name: 'tokenAddress', type: ABIDataTypes.ADDRESS },
            { name: 'creator', type: ABIDataTypes.ADDRESS },
            { name: 'totalDeposited', type: ABIDataTypes.UINT256 },
            { name: 'remainingBalance', type: ABIDataTypes.UINT256 },
            { name: 'amountPerClaim', type: ABIDataTypes.UINT256 },
            { name: 'cooldownSeconds', type: ABIDataTypes.UINT64 },
            { name: 'active', type: ABIDataTypes.BOOL },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getFaucetCount',
        constant: true,
        inputs: [],
        outputs: [{ name: 'count', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
];
