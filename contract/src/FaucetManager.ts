import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    encodeSelector,
    NetEvent,
    OP_NET,
    Revert,
    SafeMath,
    Selector,
    StoredMapU256,
    StoredU256,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';

import {
    ADDRESS_BYTE_LENGTH,
    BOOLEAN_BYTE_LENGTH,
    SELECTOR_BYTE_LENGTH,
    U256_BYTE_LENGTH,
    U64_BYTE_LENGTH,
    U8_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime/utils/lengths';

import { encodePointerUnknownLength } from '@btc-vision/btc-runtime/runtime/math/abi';
import { EMPTY_POINTER } from '@btc-vision/btc-runtime/runtime/math/bytes';

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

class FaucetCreatedEvent extends NetEvent {
    constructor(faucetId: u256, token: Address, creator: Address, totalAmount: u256) {
        const data = new BytesWriter(
            U256_BYTE_LENGTH + ADDRESS_BYTE_LENGTH + ADDRESS_BYTE_LENGTH + U256_BYTE_LENGTH,
        );
        data.writeU256(faucetId);
        data.writeAddress(token);
        data.writeAddress(creator);
        data.writeU256(totalAmount);
        super('FaucetCreated', data);
    }
}

class ClaimedEvent extends NetEvent {
    constructor(faucetId: u256, claimer: Address, amount: u256) {
        const data = new BytesWriter(
            U256_BYTE_LENGTH + ADDRESS_BYTE_LENGTH + U256_BYTE_LENGTH,
        );
        data.writeU256(faucetId);
        data.writeAddress(claimer);
        data.writeU256(amount);
        super('Claimed', data);
    }
}

class FaucetDepletedEvent extends NetEvent {
    constructor(faucetId: u256) {
        const data = new BytesWriter(U256_BYTE_LENGTH);
        data.writeU256(faucetId);
        super('FaucetDepleted', data);
    }
}

// ---------------------------------------------------------------------------
// Cooldown constants (in seconds)
// ---------------------------------------------------------------------------

const COOLDOWN_ONE_SHOT: u64 = u64.MAX_VALUE;
const COOLDOWN_HOURLY: u64 = 3600;
const COOLDOWN_6H: u64 = 21600;
const COOLDOWN_12H: u64 = 43200;
const COOLDOWN_DAILY: u64 = 86400;

// ---------------------------------------------------------------------------
// Helper: address <-> u256 conversion
// ---------------------------------------------------------------------------

function addressToU256(addr: Address): u256 {
    return u256.fromUint8ArrayBE(addr);
}

function u256ToAddress(val: u256): Address {
    return Address.fromUint8Array(val.toUint8Array(true));
}

// ---------------------------------------------------------------------------
// Storage pointers
// ---------------------------------------------------------------------------

const POINTER_FAUCET_COUNT: u16 = 1;

// Per-faucet metadata stored in StoredMapU256 keyed by faucetId
const POINTER_TOKEN: u16 = 10;
const POINTER_CREATOR: u16 = 11;
const POINTER_TOTAL_DEPOSITED: u16 = 12;
const POINTER_REMAINING_BALANCE: u16 = 13;
const POINTER_AMOUNT_PER_CLAIM: u16 = 14;
const POINTER_COOLDOWN_SECONDS: u16 = 15;
const POINTER_ACTIVE: u16 = 16;

// Last claim timestamps: composite key = faucetId + claimer address
const POINTER_LAST_CLAIM: u16 = 20;

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

const CREATE_FAUCET_SELECTOR: Selector = encodeSelector(
    'createFaucet(address,uint256,uint256,uint8)',
);
const CLAIM_SELECTOR: Selector = encodeSelector('claim(uint256)');
const GET_FAUCET_SELECTOR: Selector = encodeSelector('getFaucet(uint256)');
const GET_FAUCET_COUNT_SELECTOR: Selector = encodeSelector('getFaucetCount()');

// ---------------------------------------------------------------------------
// FaucetManager contract
// ---------------------------------------------------------------------------

export class FaucetManager extends OP_NET {
    // -- Storage --

    private readonly faucetCount: StoredU256 = new StoredU256(
        POINTER_FAUCET_COUNT,
        EMPTY_POINTER,
    );

    private readonly tokenMap: StoredMapU256 = new StoredMapU256(POINTER_TOKEN);
    private readonly creatorMap: StoredMapU256 = new StoredMapU256(POINTER_CREATOR);
    private readonly totalDepositedMap: StoredMapU256 = new StoredMapU256(POINTER_TOTAL_DEPOSITED);
    private readonly remainingBalanceMap: StoredMapU256 = new StoredMapU256(
        POINTER_REMAINING_BALANCE,
    );
    private readonly amountPerClaimMap: StoredMapU256 = new StoredMapU256(
        POINTER_AMOUNT_PER_CLAIM,
    );
    private readonly cooldownSecondsMap: StoredMapU256 = new StoredMapU256(
        POINTER_COOLDOWN_SECONDS,
    );
    private readonly activeMap: StoredMapU256 = new StoredMapU256(POINTER_ACTIVE);

    // -- Contract interface --

    public override execute(method: Selector, calldata: Calldata): BytesWriter {
        switch (method) {
            case CREATE_FAUCET_SELECTOR:
                return this.createFaucet(calldata);
            case CLAIM_SELECTOR:
                return this.claim(calldata);
            case GET_FAUCET_SELECTOR:
                return this.getFaucet(calldata);
            case GET_FAUCET_COUNT_SELECTOR:
                return this.getFaucetCount();
            default:
                return super.execute(method, calldata);
        }
    }

    // -- createFaucet --

    private createFaucet(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const totalAmount: u256 = calldata.readU256();
        const amountPerClaim: u256 = calldata.readU256();
        const cooldownType: u8 = calldata.readU8();

        // Validate inputs
        if (token.isZero()) {
            throw new Revert('Token address cannot be zero');
        }

        if (totalAmount.isZero()) {
            throw new Revert('Total amount must be greater than zero');
        }

        if (amountPerClaim.isZero()) {
            throw new Revert('Amount per claim must be greater than zero');
        }

        if (u256.lt(totalAmount, amountPerClaim)) {
            throw new Revert('Total amount must be >= amount per claim');
        }

        const cooldownSeconds: u64 = this.getCooldownSeconds(cooldownType);

        const sender: Address = Blockchain.tx.sender;

        // Pull tokens from the sender via transferFrom
        // Requires prior approval from sender to this contract
        TransferHelper.transferFrom(token, sender, this.address, totalAmount);

        // Assign new faucetId = currentCount + 1
        const currentCount: u256 = this.faucetCount.value;
        const faucetId: u256 = SafeMath.add(currentCount, u256.One);

        // Store faucet metadata
        this.tokenMap.set(faucetId, addressToU256(token));
        this.creatorMap.set(faucetId, addressToU256(sender));
        this.totalDepositedMap.set(faucetId, totalAmount);
        this.remainingBalanceMap.set(faucetId, totalAmount);
        this.amountPerClaimMap.set(faucetId, amountPerClaim);
        this.cooldownSecondsMap.set(faucetId, u256.fromU64(cooldownSeconds));
        this.activeMap.set(faucetId, u256.One); // 1 = active

        // Update counter
        this.faucetCount.value = faucetId;

        // Emit event
        this.emitEvent(new FaucetCreatedEvent(faucetId, token, sender, totalAmount));

        // Return faucetId
        const response = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(faucetId);
        return response;
    }

    // -- claim --

    private claim(calldata: Calldata): BytesWriter {
        const faucetId: u256 = calldata.readU256();

        // Validate faucet exists
        if (faucetId.isZero() || u256.gt(faucetId, this.faucetCount.value)) {
            throw new Revert('Faucet does not exist');
        }

        // Check faucet is active
        const active: u256 = this.activeMap.get(faucetId);
        if (active.isZero()) {
            throw new Revert('Faucet is not active');
        }

        // Check remaining balance
        const remaining: u256 = this.remainingBalanceMap.get(faucetId);
        const amountPerClaim: u256 = this.amountPerClaimMap.get(faucetId);

        if (u256.lt(remaining, amountPerClaim)) {
            throw new Revert('Faucet has insufficient remaining balance');
        }

        // Check cooldown
        const claimer: Address = Blockchain.tx.sender;
        const cooldownSeconds: u256 = this.cooldownSecondsMap.get(faucetId);
        const lastClaim: u256 = this.getLastClaim(faucetId, claimer);
        const currentTime: u64 = Blockchain.block.medianTimestamp;
        const currentTimeU256: u256 = u256.fromU64(currentTime);

        if (!lastClaim.isZero()) {
            // User has claimed before
            if (u256.eq(cooldownSeconds, u256.fromU64(COOLDOWN_ONE_SHOT))) {
                // One-shot: permanent block after first claim
                throw new Revert('One-shot faucet: already claimed');
            }

            // Check if enough time has passed
            const nextClaimTime: u256 = SafeMath.add(lastClaim, cooldownSeconds);
            if (u256.gt(nextClaimTime, currentTimeU256)) {
                throw new Revert('Cooldown period has not elapsed');
            }
        }

        // -- Effects (update state BEFORE external call) --

        // Update remaining balance
        const newRemaining: u256 = SafeMath.sub(remaining, amountPerClaim);
        this.remainingBalanceMap.set(faucetId, newRemaining);

        // Update last claim time
        this.setLastClaim(faucetId, claimer, currentTimeU256);

        // Deactivate if depleted
        const depleted: bool = u256.lt(newRemaining, amountPerClaim);
        if (depleted) {
            this.activeMap.set(faucetId, u256.Zero);
        }

        // -- Interactions (external call) --

        // Transfer tokens to claimer
        const token: Address = u256ToAddress(this.tokenMap.get(faucetId));
        TransferHelper.transfer(token, claimer, amountPerClaim);

        // Emit events
        this.emitEvent(new ClaimedEvent(faucetId, claimer, amountPerClaim));
        if (depleted) {
            this.emitEvent(new FaucetDepletedEvent(faucetId));
        }

        // Return success
        const response = new BytesWriter(BOOLEAN_BYTE_LENGTH);
        response.writeBoolean(true);
        return response;
    }

    // -- getFaucet (view) --

    private getFaucet(calldata: Calldata): BytesWriter {
        const faucetId: u256 = calldata.readU256();

        if (faucetId.isZero() || u256.gt(faucetId, this.faucetCount.value)) {
            throw new Revert('Faucet does not exist');
        }

        const tokenU256: u256 = this.tokenMap.get(faucetId);
        const creatorU256: u256 = this.creatorMap.get(faucetId);
        const totalDeposited: u256 = this.totalDepositedMap.get(faucetId);
        const remainingBalance: u256 = this.remainingBalanceMap.get(faucetId);
        const amountPerClaim: u256 = this.amountPerClaimMap.get(faucetId);
        const cooldownSeconds: u256 = this.cooldownSecondsMap.get(faucetId);
        const active: u256 = this.activeMap.get(faucetId);

        const token: Address = u256ToAddress(tokenU256);
        const creator: Address = u256ToAddress(creatorU256);

        const response = new BytesWriter(
            ADDRESS_BYTE_LENGTH +       // token
            ADDRESS_BYTE_LENGTH +       // creator
            U256_BYTE_LENGTH +          // totalDeposited
            U256_BYTE_LENGTH +          // remainingBalance
            U256_BYTE_LENGTH +          // amountPerClaim
            U64_BYTE_LENGTH +           // cooldownSeconds (as u64)
            BOOLEAN_BYTE_LENGTH,        // active
        );

        response.writeAddress(token);
        response.writeAddress(creator);
        response.writeU256(totalDeposited);
        response.writeU256(remainingBalance);
        response.writeU256(amountPerClaim);
        response.writeU64(cooldownSeconds.toU64());
        response.writeBoolean(!active.isZero());

        return response;
    }

    // -- getFaucetCount (view) --

    private getFaucetCount(): BytesWriter {
        const response = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(this.faucetCount.value);
        return response;
    }

    // -- Internal helpers --

    private getCooldownSeconds(cooldownType: u8): u64 {
        switch (cooldownType) {
            case 0:
                return COOLDOWN_ONE_SHOT;
            case 1:
                return COOLDOWN_HOURLY;
            case 2:
                return COOLDOWN_6H;
            case 3:
                return COOLDOWN_12H;
            case 4:
                return COOLDOWN_DAILY;
            default:
                throw new Revert('Invalid cooldown type');
        }
    }

    /**
     * Get last claim timestamp for a specific (faucetId, claimer) pair.
     * Uses a composite storage key: pointer POINTER_LAST_CLAIM with
     * subPointer = sha256(faucetId bytes + claimer address bytes).
     */
    private getLastClaim(faucetId: u256, claimer: Address): u256 {
        const keyPointer: Uint8Array = this.lastClaimPointer(faucetId, claimer);
        return u256.fromUint8ArrayBE(Blockchain.getStorageAt(keyPointer));
    }

    /**
     * Set last claim timestamp for a specific (faucetId, claimer) pair.
     */
    private setLastClaim(faucetId: u256, claimer: Address, timestamp: u256): void {
        const keyPointer: Uint8Array = this.lastClaimPointer(faucetId, claimer);
        Blockchain.setStorageAt(keyPointer, timestamp.toUint8Array(true));
    }

    /**
     * Build the storage pointer for the last claim 2D map.
     * Composite key = faucetId (32 bytes) + claimer (32 bytes) = 64 bytes.
     * Hashed via encodePointerUnknownLength to get a 32-byte storage key.
     */
    private lastClaimPointer(faucetId: u256, claimer: Address): Uint8Array {
        const writer = new BytesWriter(U256_BYTE_LENGTH + ADDRESS_BYTE_LENGTH);
        writer.writeU256(faucetId);
        writer.writeAddress(claimer);
        return encodePointerUnknownLength(POINTER_LAST_CLAIM, writer.getBuffer());
    }
}
