# Free Faucet Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a decentralized faucet dapp on OPNet where anyone can create and claim OP20 token faucets, with on-chain cooldowns and IP-based anti-sybil protection.

**Architecture:** Smart contract `FaucetManager` (AssemblyScript, extends OP_NET) manages all faucets on-chain. React/Vite frontend with WalletConnect v2 for wallet interaction. Vercel Edge Functions + KV for IP-based rate limiting. Two separate projects: `contract/` and `frontend/`.

**Tech Stack:** AssemblyScript (contract), React 18 + Vite + TypeScript (frontend), OPNet btc-runtime, opnet npm package, @btc-vision/walletconnect v2, Vercel Edge Functions + KV, react-router-dom.

---

## Task 1: Initialize Git Repository and Monorepo Structure

**Files:**
- Create: `.gitignore`
- Create: `README.md` (minimal)
- Create: `contract/` directory
- Create: `frontend/` directory

**Step 1: Initialize git repo**

```bash
cd /Users/yohannrc/free-faucet
git init
```

**Step 2: Create .gitignore**

```gitignore
node_modules/
dist/
build/
.env
.env.local
.vercel/
*.wasm
*.wat
*.map
```

**Step 3: Create minimal README**

```markdown
# Free Faucet

Decentralized OP20 token faucet platform on OPNet. Create and claim faucets for any OP20 token.

Built for the OPNet dapp contest.
```

**Step 4: Create directory structure**

```bash
mkdir -p contract/src frontend/src
```

**Step 5: Commit**

```bash
git add .gitignore README.md
git commit -m "feat: initialize repository structure"
```

---

## Task 2: Smart Contract Project Setup

**Files:**
- Create: `contract/package.json`
- Create: `contract/asconfig.json`
- Create: `contract/tsconfig.json`
- Create: `contract/eslint.config.js`

**Step 1: Create contract/package.json**

```json
{
    "name": "free-faucet-contract",
    "version": "1.0.0",
    "type": "module",
    "scripts": {
        "build": "asc src/index.ts --config asconfig.json --target debug",
        "lint": "eslint src",
        "clean": "rm -rf build/*"
    }
}
```

**Step 2: Create contract/asconfig.json**

```json
{
    "targets": {
        "debug": {
            "outFile": "build/FaucetManager.wasm",
            "textFile": "build/FaucetManager.wat"
        }
    },
    "options": {
        "transform": "@btc-vision/opnet-transform",
        "sourceMap": false,
        "optimizeLevel": 3,
        "shrinkLevel": 1,
        "converge": true,
        "noAssert": false,
        "enable": [
            "sign-extension",
            "mutable-globals",
            "nontrapping-f2i",
            "bulk-memory",
            "simd",
            "reference-types",
            "multi-value"
        ],
        "runtime": "stub",
        "memoryBase": 0,
        "initialMemory": 1,
        "exportStart": "start",
        "use": [
            "abort=index/abort"
        ]
    }
}
```

**Step 3: Create contract/tsconfig.json**

```json
{
    "extends": "@btc-vision/btc-runtime/tsconfig.base.json",
    "compilerOptions": {
        "outDir": "./build"
    },
    "include": ["src/**/*"]
}
```

**Step 4: Create contract/eslint.config.js**

Copy the OPNet contract ESLint flat config (from `opnet_skill_doc(skill="opnet-development", file="docs/eslint-contract.js")`).

**Step 5: Install dependencies**

```bash
cd contract
npm init -y  # if package.json needs updating
rm -rf node_modules package-lock.json
npm uninstall assemblyscript 2>/dev/null
npx npm-check-updates -u && npm i @btc-vision/btc-runtime@rc @btc-vision/as-bignum@latest @btc-vision/assemblyscript @btc-vision/opnet-transform@latest @assemblyscript/loader@latest --prefer-online
npm i -D eslint@^10.0.0 @eslint/js@^10.0.1 typescript-eslint@^8.56.0
```

**Step 6: Commit**

```bash
git add contract/
git commit -m "feat: setup smart contract project with OPNet dependencies"
```

---

## Task 3: Implement FaucetManager Smart Contract

**Files:**
- Create: `contract/src/index.ts`
- Create: `contract/src/FaucetManager.ts`

**Step 1: Create contract entry point `contract/src/index.ts`**

```typescript
import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { FaucetManager } from './FaucetManager';
import { revertOnError } from '@btc-vision/btc-runtime/runtime/abort/abort';

Blockchain.contract = (): FaucetManager => {
    return new FaucetManager();
};

export * from '@btc-vision/btc-runtime/runtime/exports';

export function abort(message: string, fileName: string, line: u32, column: u32): void {
    revertOnError(message, fileName, line, column);
}
```

**Step 2: Create `contract/src/FaucetManager.ts`**

This is the core contract. Key design decisions:
- Extends `OP_NET` (not OP20 — this is a manager, not a token)
- Uses `StoredU256` for faucetCount
- Uses `StoredMapU256` for faucet data fields (keyed by faucetId)
- Uses nested pointer maps for lastClaim tracking
- Calls OP20 `transferFrom` and `transfer` via `Blockchain.call()`

```typescript
import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    encodeSelector,
    OP_NET,
    Revert,
    Selector,
    StoredU256,
    StoredU64,
    SafeMath,
    AddressMemoryMap,
} from '@btc-vision/btc-runtime/runtime';

const COOLDOWN_ONE_SHOT: u64 = 0;
const COOLDOWN_HOURLY: u64 = 3600;
const COOLDOWN_6H: u64 = 21600;
const COOLDOWN_12H: u64 = 43200;
const COOLDOWN_DAILY: u64 = 86400;
const MAX_TIMESTAMP: u64 = u64.MAX_VALUE;

export class FaucetManager extends OP_NET {
    // Selectors
    private readonly createFaucetSelector: Selector = encodeSelector('createFaucet(address,uint256,uint256,uint8)');
    private readonly claimSelector: Selector = encodeSelector('claim(uint256)');
    private readonly getFaucetSelector: Selector = encodeSelector('getFaucet(uint256)');
    private readonly getFaucetCountSelector: Selector = encodeSelector('getFaucetCount()');

    // Storage - faucet count
    private readonly faucetCountPointer: u16 = Blockchain.nextPointer;
    private readonly faucetCount: StoredU256 = new StoredU256(this.faucetCountPointer, u256.Zero);

    // Storage - faucet data (each field stored separately, keyed by faucetId)
    // We use separate StoredMapU256 for each field of FaucetData
    private readonly tokenAddressPointer: u16 = Blockchain.nextPointer;
    private readonly creatorPointer: u16 = Blockchain.nextPointer;
    private readonly totalDepositedPointer: u16 = Blockchain.nextPointer;
    private readonly remainingBalancePointer: u16 = Blockchain.nextPointer;
    private readonly amountPerClaimPointer: u16 = Blockchain.nextPointer;
    private readonly cooldownSecondsPointer: u16 = Blockchain.nextPointer;
    private readonly activePointer: u16 = Blockchain.nextPointer;

    // Storage maps for faucet data (faucetId → value)
    private readonly tokenAddressMap: StoredMapU256 = new StoredMapU256(this.tokenAddressPointer);
    private readonly creatorMap: StoredMapU256 = new StoredMapU256(this.creatorPointer);
    private readonly totalDepositedMap: StoredMapU256 = new StoredMapU256(this.totalDepositedPointer);
    private readonly remainingBalanceMap: StoredMapU256 = new StoredMapU256(this.remainingBalancePointer);
    private readonly amountPerClaimMap: StoredMapU256 = new StoredMapU256(this.amountPerClaimPointer);
    private readonly cooldownSecondsMap: StoredMapU256 = new StoredMapU256(this.cooldownSecondsPointer);
    private readonly activeMap: StoredMapU256 = new StoredMapU256(this.activePointer);

    // Storage - last claim timestamps (faucetId → claimer → timestamp)
    // Uses AddressMemoryMap per faucet (we'll create these dynamically via pointer math)
    private readonly lastClaimBasePointer: u16 = Blockchain.nextPointer;

    public constructor() {
        super();
    }

    public override callMethod(calldata: Calldata): BytesWriter {
        const selector: Selector = calldata.readSelector();

        switch (selector) {
            case this.createFaucetSelector:
                return this._createFaucet(calldata);
            case this.claimSelector:
                return this._claim(calldata);
            case this.getFaucetSelector:
                return this._getFaucet(calldata);
            case this.getFaucetCountSelector:
                return this._getFaucetCount();
            default:
                return super.callMethod(calldata);
        }
    }

    // createFaucet(tokenAddress, totalAmount, amountPerClaim, cooldownType)
    @method(
        { name: 'token', type: ABIDataTypes.ADDRESS },
        { name: 'totalAmount', type: ABIDataTypes.UINT256 },
        { name: 'amountPerClaim', type: ABIDataTypes.UINT256 },
        { name: 'cooldownType', type: ABIDataTypes.UINT8 }
    )
    @returns({ name: 'faucetId', type: ABIDataTypes.UINT256 })
    private _createFaucet(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const totalAmount: u256 = calldata.readU256();
        const amountPerClaim: u256 = calldata.readU256();
        const cooldownType: u8 = calldata.readU8();

        // Validate inputs
        if (u256.eq(totalAmount, u256.Zero)) {
            Revert('Total amount must be > 0');
        }
        if (u256.eq(amountPerClaim, u256.Zero)) {
            Revert('Amount per claim must be > 0');
        }
        if (u256.gt(amountPerClaim, totalAmount)) {
            Revert('Amount per claim > total');
        }

        // Validate cooldown type
        const cooldownSeconds: u64 = this.getCooldownSeconds(cooldownType);

        // Transfer tokens from caller to this contract via transferFrom
        // The caller must have approved this contract beforehand
        const caller: Address = Blockchain.tx.sender;
        const contractAddress: Address = Blockchain.contractAddress;

        // Call transferFrom on the token contract
        const transferCalldata: BytesWriter = new BytesWriter(4 + 32 + 32 + 32);
        transferCalldata.writeSelector(encodeSelector('transferFrom(address,address,uint256)'));
        transferCalldata.writeAddress(caller);
        transferCalldata.writeAddress(contractAddress);
        transferCalldata.writeU256(totalAmount);

        const result: Calldata = Blockchain.call(token, transferCalldata);
        const success: bool = result.readBoolean();
        if (!success) {
            Revert('TransferFrom failed - did you approve?');
        }

        // Get current faucet count as ID
        const faucetId: u256 = this.faucetCount.get();

        // Store faucet data
        this.tokenAddressMap.set(faucetId, token.toU256());
        this.creatorMap.set(faucetId, caller.toU256());
        this.totalDepositedMap.set(faucetId, totalAmount);
        this.remainingBalanceMap.set(faucetId, totalAmount);
        this.amountPerClaimMap.set(faucetId, amountPerClaim);
        this.cooldownSecondsMap.set(faucetId, u256.fromU64(cooldownSeconds));
        this.activeMap.set(faucetId, u256.One); // 1 = active

        // Increment faucet count
        this.faucetCount.set(SafeMath.add(faucetId, u256.One));

        // Return faucetId
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(faucetId);
        return writer;
    }

    // claim(faucetId)
    @method({ name: 'faucetId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    private _claim(calldata: Calldata): BytesWriter {
        const faucetId: u256 = calldata.readU256();

        // Check faucet exists
        const count: u256 = this.faucetCount.get();
        if (u256.gte(faucetId, count)) {
            Revert('Faucet does not exist');
        }

        // Check faucet is active
        const isActive: u256 = this.activeMap.get(faucetId);
        if (u256.eq(isActive, u256.Zero)) {
            Revert('Faucet is inactive');
        }

        const caller: Address = Blockchain.tx.sender;
        const cooldownSeconds: u64 = this.cooldownSecondsMap.get(faucetId).toU64();
        const currentTimestamp: u64 = Blockchain.block.timestamp;

        // Check cooldown via AddressMemoryMap for this faucet
        const lastClaimPointer: u16 = this.lastClaimBasePointer + <u16>faucetId.toU32();
        const lastClaimMap: AddressMemoryMap<Address, StoredU64> = new AddressMemoryMap<Address, StoredU64>(
            lastClaimPointer,
            Address.dead()
        );
        const lastClaimStorage: StoredU64 = lastClaimMap.get(caller);
        const lastClaimTime: u64 = lastClaimStorage.get();

        // For one-shot: if lastClaim == MAX_TIMESTAMP, already claimed
        if (lastClaimTime == MAX_TIMESTAMP) {
            Revert('Already claimed (one-shot)');
        }

        // Check cooldown elapsed
        if (lastClaimTime > 0 && cooldownSeconds > 0) {
            const nextClaimTime: u64 = lastClaimTime + cooldownSeconds;
            if (currentTimestamp < nextClaimTime) {
                Revert('Cooldown not elapsed');
            }
        }

        // Get amount per claim
        const amountPerClaim: u256 = this.amountPerClaimMap.get(faucetId);
        const remainingBalance: u256 = this.remainingBalanceMap.get(faucetId);

        // Check sufficient balance
        if (u256.lt(remainingBalance, amountPerClaim)) {
            Revert('Faucet depleted');
        }

        // Update state BEFORE external call (checks-effects-interactions)
        const newBalance: u256 = SafeMath.sub(remainingBalance, amountPerClaim);
        this.remainingBalanceMap.set(faucetId, newBalance);

        // Update last claim timestamp
        if (cooldownSeconds == COOLDOWN_ONE_SHOT) {
            lastClaimStorage.set(MAX_TIMESTAMP); // Permanent block
        } else {
            lastClaimStorage.set(currentTimestamp);
        }

        // Deactivate if depleted
        if (u256.lt(newBalance, amountPerClaim)) {
            this.activeMap.set(faucetId, u256.Zero);
        }

        // Transfer tokens to claimer
        const tokenAddress: Address = Address.fromU256(this.tokenAddressMap.get(faucetId));
        const transferCalldata: BytesWriter = new BytesWriter(4 + 32 + 32);
        transferCalldata.writeSelector(encodeSelector('transfer(address,uint256)'));
        transferCalldata.writeAddress(caller);
        transferCalldata.writeU256(amountPerClaim);

        const result: Calldata = Blockchain.call(tokenAddress, transferCalldata);
        const success: bool = result.readBoolean();
        if (!success) {
            Revert('Token transfer failed');
        }

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // getFaucet(faucetId) — view
    @method({ name: 'faucetId', type: ABIDataTypes.UINT256 })
    @returns(
        { name: 'tokenAddress', type: ABIDataTypes.ADDRESS },
        { name: 'creator', type: ABIDataTypes.ADDRESS },
        { name: 'totalDeposited', type: ABIDataTypes.UINT256 },
        { name: 'remainingBalance', type: ABIDataTypes.UINT256 },
        { name: 'amountPerClaim', type: ABIDataTypes.UINT256 },
        { name: 'cooldownSeconds', type: ABIDataTypes.UINT256 },
        { name: 'active', type: ABIDataTypes.BOOL }
    )
    private _getFaucet(calldata: Calldata): BytesWriter {
        const faucetId: u256 = calldata.readU256();

        const count: u256 = this.faucetCount.get();
        if (u256.gte(faucetId, count)) {
            Revert('Faucet does not exist');
        }

        const writer: BytesWriter = new BytesWriter(32 + 32 + 32 + 32 + 32 + 32 + 1);
        writer.writeAddress(Address.fromU256(this.tokenAddressMap.get(faucetId)));
        writer.writeAddress(Address.fromU256(this.creatorMap.get(faucetId)));
        writer.writeU256(this.totalDepositedMap.get(faucetId));
        writer.writeU256(this.remainingBalanceMap.get(faucetId));
        writer.writeU256(this.amountPerClaimMap.get(faucetId));
        writer.writeU256(this.cooldownSecondsMap.get(faucetId));
        writer.writeBoolean(!u256.eq(this.activeMap.get(faucetId), u256.Zero));

        return writer;
    }

    // getFaucetCount() — view
    @method()
    @returns({ name: 'count', type: ABIDataTypes.UINT256 })
    private _getFaucetCount(): BytesWriter {
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(this.faucetCount.get());
        return writer;
    }

    private getCooldownSeconds(cooldownType: u8): u64 {
        switch (cooldownType) {
            case 0: return COOLDOWN_ONE_SHOT;
            case 1: return COOLDOWN_HOURLY;
            case 2: return COOLDOWN_6H;
            case 3: return COOLDOWN_12H;
            case 4: return COOLDOWN_DAILY;
            default:
                Revert('Invalid cooldown type');
                return 0; // unreachable
        }
    }
}
```

**NOTE:** The contract code above is a starting point. The exact APIs for `Blockchain.call()`, `Address.toU256()`, `Address.fromU256()`, `StoredMapU256`, and `AddressMemoryMap` with `StoredU64` need to be verified against the actual btc-runtime API at build time. Adjust as needed based on compilation errors.

**Step 3: Lint the contract**

```bash
cd contract && npm run lint
```
Fix any lint errors.

**Step 4: Build the contract**

```bash
npm run build
```
Expected: `build/FaucetManager.wasm` generated. Fix any compilation errors.

**Step 5: Commit**

```bash
git add contract/src/
git commit -m "feat: implement FaucetManager smart contract"
```

---

## Task 4: Frontend Project Setup

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/eslint.config.js`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/vite-env.d.ts`

**Step 1: Create frontend/package.json**

```json
{
    "name": "free-faucet",
    "version": "1.0.0",
    "type": "module",
    "scripts": {
        "dev": "vite",
        "build": "vite build",
        "preview": "vite preview",
        "lint": "eslint src",
        "lint:fix": "eslint src --fix",
        "typecheck": "tsc --noEmit"
    }
}
```

**Step 2: Install dependencies**

```bash
cd frontend
rm -rf node_modules package-lock.json
npx npm-check-updates -u && npm i @btc-vision/bitcoin@rc @btc-vision/bip32@latest @btc-vision/ecpair@latest @btc-vision/transaction@rc opnet@rc @btc-vision/walletconnect@latest react react-dom react-router-dom --prefer-online
npm i -D @types/react @types/react-dom @vitejs/plugin-react vite vite-plugin-node-polyfills vite-plugin-eslint2 typescript eslint@^10.0.0 @eslint/js@^10.0.1 typescript-eslint@^8.56.0 eslint-plugin-react-hooks eslint-plugin-react-refresh
```

**Step 3: Create frontend/vite.config.ts**

Use the complete OPNet Vite config from `opnet_opnet_dev(doc_name="guidelines/setup-guidelines.md", section="vite.config.ts (COMPLETE - USE THIS)")`.

**Step 4: Create frontend/tsconfig.json**

```json
{
    "compilerOptions": {
        "target": "ESNext",
        "module": "ESNext",
        "moduleResolution": "bundler",
        "strict": true,
        "noImplicitAny": true,
        "strictNullChecks": true,
        "noUnusedLocals": true,
        "noUnusedParameters": true,
        "noImplicitReturns": true,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "jsx": "react-jsx",
        "lib": ["ESNext", "DOM", "DOM.Iterable"]
    },
    "include": ["src"]
}
```

**Step 5: Create frontend/eslint.config.js**

Copy the OPNet React ESLint flat config (from `opnet_skill_doc(skill="opnet-development", file="docs/eslint-react.js")`).

**Step 6: Create frontend/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Free Faucet - OPNet Token Faucet Hub</title>
</head>
<body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

**Step 7: Create frontend/src/vite-env.d.ts**

```typescript
/// <reference types="vite/client" />
```

**Step 8: Create frontend/src/main.tsx and App.tsx (minimal skeleton)**

`src/main.tsx`:
```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
    <StrictMode>
        <App />
    </StrictMode>
);
```

`src/App.tsx`:
```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';

export function App(): JSX.Element {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<div>Free Faucet - Coming Soon</div>} />
            </Routes>
        </BrowserRouter>
    );
}
```

**Step 9: Create minimal `src/styles/global.css`**

```css
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Inter', system-ui, sans-serif; min-height: 100vh; }
```

**Step 10: Verify dev server starts**

```bash
cd frontend && npm run dev
```
Expected: Vite dev server starts. Visit localhost and see "Free Faucet - Coming Soon".

**Step 11: Commit**

```bash
git add frontend/
git commit -m "feat: setup frontend project with Vite and OPNet dependencies"
```

---

## Task 5: OPNet Provider and Config

**Files:**
- Create: `frontend/src/config/contracts.ts`
- Create: `frontend/src/config/networks.ts`
- Create: `frontend/src/services/ProviderService.ts`

**Step 1: Create network config `frontend/src/config/networks.ts`**

```typescript
import { networks, Network } from '@btc-vision/bitcoin';

export const SUPPORTED_NETWORKS: Record<string, { network: Network; rpcUrl: string }> = {
    regtest: {
        network: networks.regtest,
        rpcUrl: 'https://regtest.opnet.org',
    },
};

export const DEFAULT_NETWORK = 'regtest';
```

**Step 2: Create contract addresses config `frontend/src/config/contracts.ts`**

```typescript
export const FAUCET_MANAGER_ADDRESS: Record<string, string> = {
    regtest: '0x_DEPLOY_ADDRESS_HERE_', // Set after contract deployment
};
```

**Step 3: Create provider service `frontend/src/services/ProviderService.ts`**

```typescript
import { JSONRpcProvider } from 'opnet';
import { Network } from '@btc-vision/bitcoin';

let providerInstance: JSONRpcProvider | null = null;
let currentUrl: string = '';

export function getProvider(url: string, network: Network): JSONRpcProvider {
    if (providerInstance && currentUrl === url) {
        return providerInstance;
    }
    if (providerInstance) {
        void providerInstance.close();
    }
    providerInstance = new JSONRpcProvider({ url, network });
    currentUrl = url;
    return providerInstance;
}
```

**Step 4: Commit**

```bash
git add frontend/src/config/ frontend/src/services/
git commit -m "feat: add OPNet provider service and network config"
```

---

## Task 6: Wallet Connection with WalletConnect v2

**Files:**
- Create: `frontend/src/components/WalletConnect.tsx`
- Create: `frontend/src/components/Header.tsx`
- Modify: `frontend/src/App.tsx`

**Step 1: Create WalletConnect component `frontend/src/components/WalletConnect.tsx`**

```typescript
import { useWalletConnect, SupportedWallets } from '@btc-vision/walletconnect';
import { networks } from '@btc-vision/bitcoin';

export function WalletConnectButton(): JSX.Element {
    const { isConnected, address, network, connectToWallet, disconnect } = useWalletConnect();

    const handleConnect = async (): Promise<void> => {
        await connectToWallet(SupportedWallets.OP_WALLET);
    };

    if (isConnected && address) {
        const shortAddr = `${address.slice(0, 8)}...${address.slice(-6)}`;
        const networkName = network === networks.bitcoin ? 'Mainnet' : 'Regtest';
        return (
            <div className="wallet-connected">
                <span className="network-badge">{networkName}</span>
                <span className="wallet-address">{shortAddr}</span>
                <button className="btn-disconnect" onClick={disconnect}>Disconnect</button>
            </div>
        );
    }

    return (
        <button className="btn-connect" onClick={handleConnect}>
            Connect Wallet
        </button>
    );
}
```

**Step 2: Create Header component `frontend/src/components/Header.tsx`**

```typescript
import { Link } from 'react-router-dom';
import { WalletConnectButton } from './WalletConnect';

export function Header(): JSX.Element {
    return (
        <header className="header">
            <Link to="/" className="logo">Free Faucet</Link>
            <nav className="nav">
                <Link to="/" className="nav-link">Faucets</Link>
                <Link to="/create" className="nav-link">Create</Link>
            </nav>
            <WalletConnectButton />
        </header>
    );
}
```

**Step 3: Update App.tsx to include Header and routes**

```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Header } from './components/Header';

export function App(): JSX.Element {
    return (
        <BrowserRouter>
            <div className="app">
                <Header />
                <main className="main">
                    <Routes>
                        <Route path="/" element={<div>Faucet Grid Placeholder</div>} />
                        <Route path="/create" element={<div>Create Faucet Placeholder</div>} />
                        <Route path="/faucet/:id" element={<div>Faucet Detail Placeholder</div>} />
                    </Routes>
                </main>
            </div>
        </BrowserRouter>
    );
}
```

**Step 4: Verify wallet connect works in dev**

```bash
cd frontend && npm run dev
```

**Step 5: Commit**

```bash
git add frontend/src/
git commit -m "feat: add wallet connection with WalletConnect v2"
```

---

## Task 7: Contract Hooks and ABI

**Files:**
- Create: `frontend/src/abi/FaucetManagerABI.ts`
- Create: `frontend/src/hooks/useFaucetContract.ts`
- Create: `frontend/src/hooks/useTokenInfo.ts`
- Create: `frontend/src/hooks/useFaucets.ts`
- Create: `frontend/src/hooks/useClaim.ts`

**Step 1: Create FaucetManager ABI `frontend/src/abi/FaucetManagerABI.ts`**

Define the ABI for the FaucetManager contract matching the selectors and params from the contract. This must match the `@method` and `@returns` decorators exactly. Use the `opnet` package's ABI format.

**Step 2: Create useFaucetContract hook `frontend/src/hooks/useFaucetContract.ts`**

```typescript
import { useMemo } from 'react';
import { getContract, JSONRpcProvider } from 'opnet';
import { Address } from '@btc-vision/transaction';
import { Network } from '@btc-vision/bitcoin';
import { FAUCET_MANAGER_ABI } from '../abi/FaucetManagerABI';

export function useFaucetContract(
    provider: JSONRpcProvider | null,
    network: Network,
    senderAddress?: string
) {
    return useMemo(() => {
        if (!provider) return null;
        const contractAddr = Address.fromString('0x_DEPLOY_ADDRESS_HERE_');
        return getContract(contractAddr, FAUCET_MANAGER_ABI, provider, network, senderAddress);
    }, [provider, network, senderAddress]);
}
```

**Step 3: Create useTokenInfo hook `frontend/src/hooks/useTokenInfo.ts`**

Fetches name, symbol, decimals of a token OP20 by address using `getContract` with `OP_20_ABI`.

**Step 4: Create useFaucets hook `frontend/src/hooks/useFaucets.ts`**

Calls `getFaucetCount()` then loops `getFaucet(i)` for each faucet. Returns array of faucet data.

**Step 5: Create useClaim hook `frontend/src/hooks/useClaim.ts`**

Handles the claim flow: verify IP via edge function, then call `claim(faucetId)` with simulate + sendTransaction. Uses `signer: null, mldsaSigner: null` (frontend rule).

**Step 6: Commit**

```bash
git add frontend/src/abi/ frontend/src/hooks/
git commit -m "feat: add contract hooks and ABI definitions"
```

---

## Task 8: Faucet Creation Page

**Files:**
- Create: `frontend/src/components/CreateFaucetForm.tsx`
- Create: `frontend/src/components/TokenInfo.tsx`
- Modify: `frontend/src/App.tsx` (wire route)

**Step 1: Create TokenInfo component**

Given a token contract address string, uses `useTokenInfo` hook to display name, symbol, decimals. Shows loading state.

**Step 2: Create CreateFaucetForm component**

Form with:
- Text input for token contract address (validates hex format)
- TokenInfo display when valid address entered
- Number input for total amount
- Number input for amount per claim
- Select for cooldown type (One-shot, Hourly, 6h, 12h, Daily)
- Two-step button: "Approve" then "Create Faucet"

Approve flow: `getContract<IOP20Contract>` → `token.approve(faucetManagerAddress, totalAmount)` → simulate → sendTransaction with `signer: null, mldsaSigner: null`.

Create flow: `faucetContract.createFaucet(token, totalAmount, amountPerClaim, cooldownType)` → simulate → sendTransaction with `signer: null, mldsaSigner: null`.

**Step 3: Wire route in App.tsx**

```typescript
<Route path="/create" element={<CreateFaucetForm />} />
```

**Step 4: Verify form renders and validates**

```bash
cd frontend && npm run dev
```

**Step 5: Commit**

```bash
git add frontend/src/components/CreateFaucetForm.tsx frontend/src/components/TokenInfo.tsx frontend/src/App.tsx
git commit -m "feat: add faucet creation form with approve flow"
```

---

## Task 9: Faucet Cards and Main Page

**Files:**
- Create: `frontend/src/components/FaucetCard.tsx`
- Create: `frontend/src/components/FaucetGrid.tsx`
- Create: `frontend/src/components/ClaimButton.tsx`
- Modify: `frontend/src/App.tsx` (wire route)

**Step 1: Create FaucetCard component**

Displays:
- Token name/symbol (fetched via useTokenInfo)
- Remaining balance / total deposited (progress bar)
- Amount per claim
- Cooldown type label
- Active/Depleted badge
- ClaimButton

**Step 2: Create ClaimButton component**

- If not connected: shows "Connect Wallet"
- If cooldown active: shows countdown timer
- If ready: shows "Claim X TOKENS"
- Handles claim flow via `useClaim` hook

**Step 3: Create FaucetGrid component**

Uses `useFaucets` hook to load all faucets. Renders grid of FaucetCard components. Shows loading skeleton. Shows "No faucets yet" if empty.

**Step 4: Create faucet detail page**

Simple page at `/faucet/:id` that shows a single FaucetCard enlarged with more details.

**Step 5: Wire routes in App.tsx**

```typescript
<Route path="/" element={<FaucetGrid />} />
<Route path="/faucet/:id" element={<FaucetDetail />} />
```

**Step 6: Commit**

```bash
git add frontend/src/components/
git commit -m "feat: add faucet cards grid and claim button"
```

---

## Task 10: Fun/Colorful Styling

**Files:**
- Create: `frontend/src/styles/global.css` (expand)
- Create: `frontend/src/styles/components.css`

**Step 1: Implement the fun/colorful theme**

Key design elements:
- Animated gradient background: `linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5, #23d5ab)` with animation
- Cards: `backdrop-filter: blur(10px)`, colored borders, `box-shadow` glow on hover, `transform: scale(1.02)` on hover
- Progress bars with gradient fill
- Bold, rounded buttons with gradient backgrounds
- Frequency labels with colored pills/badges
- Google Font: Inter or Poppins (playful feel)
- Confetti effect on successful claim (use `canvas-confetti` npm package or inline CSS animation)

**Step 2: Apply styles to all components**

Use CSS class names matching the components created in tasks 6-9.

**Step 3: Verify visual appearance**

```bash
cd frontend && npm run dev
```

**Step 4: Commit**

```bash
git add frontend/src/styles/
git commit -m "feat: add fun colorful styling with animations"
```

---

## Task 11: Anti-Sybil Vercel Edge Function + KV

**Files:**
- Create: `frontend/api/verify-claim.ts` (Vercel Edge Function)
- Modify: `frontend/src/hooks/useClaim.ts` (call edge function before on-chain claim)

**Step 1: Create Vercel Edge Function `frontend/api/verify-claim.ts`**

```typescript
import { kv } from '@vercel/kv';

export const config = { runtime: 'edge' };

interface ClaimRequest {
    faucetId: string;
    cooldownSeconds: number;
}

export default async function handler(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? request.headers.get('x-real-ip')
        ?? 'unknown';

    const body = await request.json() as ClaimRequest;
    const { faucetId, cooldownSeconds } = body;

    if (!faucetId || cooldownSeconds === undefined) {
        return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400 });
    }

    const kvKey = `claim:${faucetId}:${ip}`;
    const lastClaim = await kv.get<number>(kvKey);

    if (lastClaim) {
        const elapsed = Math.floor(Date.now() / 1000) - lastClaim;
        const effectiveCooldown = cooldownSeconds === 0 ? Infinity : cooldownSeconds;
        if (elapsed < effectiveCooldown) {
            const remaining = effectiveCooldown - elapsed;
            return new Response(
                JSON.stringify({ allowed: false, remainingSeconds: remaining }),
                { status: 429 }
            );
        }
    }

    // Record the claim
    const now = Math.floor(Date.now() / 1000);
    const ttl = cooldownSeconds === 0 ? 365 * 24 * 3600 : cooldownSeconds;
    await kv.set(kvKey, now, { ex: ttl });

    return new Response(JSON.stringify({ allowed: true }), { status: 200 });
}
```

**Step 2: Install Vercel KV dependency**

```bash
cd frontend && npm i @vercel/kv
```

**Step 3: Update useClaim hook to call edge function first**

Before calling the on-chain `claim()`, POST to `/api/verify-claim` with `{ faucetId, cooldownSeconds }`. If response is `{ allowed: false }`, show remaining time. If `{ allowed: true }`, proceed with on-chain claim.

**Step 4: Commit**

```bash
git add frontend/api/ frontend/src/hooks/useClaim.ts
git commit -m "feat: add anti-sybil IP rate limiting via Vercel Edge + KV"
```

---

## Task 12: Vercel Deployment Configuration

**Files:**
- Create: `frontend/vercel.json`
- Modify: `frontend/package.json` (if needed)

**Step 1: Create frontend/vercel.json**

```json
{
    "buildCommand": "npm run build",
    "outputDirectory": "dist",
    "framework": "vite",
    "rewrites": [
        { "source": "/((?!api/).*)", "destination": "/index.html" }
    ]
}
```

The `rewrites` ensure react-router-dom client-side routing works (all non-API routes serve index.html).

**Step 2: Add environment variables note**

For Vercel KV, the following env vars are needed (set in Vercel dashboard):
- `KV_URL`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `KV_REST_API_READ_ONLY_TOKEN`

These are auto-provisioned when you create a KV store in the Vercel dashboard.

**Step 3: Commit**

```bash
git add frontend/vercel.json
git commit -m "feat: add Vercel deployment configuration"
```

---

## Task 13: GitHub Repository Setup and Push

**Step 1: Create GitHub repo**

```bash
gh repo create free-faucet --public --description "Decentralized OP20 token faucet platform on OPNet" --source . --push
```

**Step 2: Verify repo is live on GitHub**

```bash
gh repo view --web
```

---

## Task 14: Build Verification and Final Lint

**Step 1: Lint contract**

```bash
cd contract && npm run lint
```

**Step 2: Build contract**

```bash
cd contract && npm run build
```

**Step 3: Lint frontend**

```bash
cd frontend && npm run lint
```

**Step 4: Typecheck frontend**

```bash
cd frontend && npm run typecheck
```

**Step 5: Build frontend**

```bash
cd frontend && npm run build
```

**Step 6: Fix any issues found, then commit**

```bash
git add -A && git commit -m "fix: resolve lint and build issues"
```

---

## Task 15: Deploy Contract to Regtest

**Step 1: Use OPNet CLI to deploy the contract**

```bash
opnet deploy --wasm contract/build/FaucetManager.wasm --network regtest
```

Consult `opnet_opnet_cli(action="guide")` for the exact deployment process.

**Step 2: Update frontend config with deployed address**

Update `frontend/src/config/contracts.ts` with the actual deployed contract address.

**Step 3: Commit**

```bash
git add frontend/src/config/contracts.ts
git commit -m "feat: update contract address after regtest deployment"
```

---

## Task 16: Deploy to Vercel

**Step 1: Link Vercel project**

```bash
cd frontend && npx vercel link
```

**Step 2: Create Vercel KV store**

```bash
npx vercel env pull .env.local
```

Set up KV in Vercel dashboard and link to the project.

**Step 3: Deploy**

```bash
npx vercel --prod
```

**Step 4: Verify live URL works**

Test the deployed URL: connect wallet, create a faucet, claim from it.

**Step 5: Push final state to GitHub**

```bash
git push
```
