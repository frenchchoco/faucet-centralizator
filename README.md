# Faucet Centralizator

Decentralized OP20 token faucet platform on OPNet (Bitcoin Layer 1). Anyone can create a faucet for any OP20 token, and users can claim tokens from a central hub.

Built for the [vibecode.finance](https://vibecodedotfinance.vercel.app) OPNet dapp contest.

## Features

- **Create faucets** for any OP20 token by contract address
- **Configurable cooldowns**: hourly, 6h, 12h, daily, or one-shot
- **Fully on-chain**: FaucetManager smart contract manages all state
- **Anti-sybil**: IP-based rate limiting via Vercel Edge Functions + KV
- **No admin keys**: Faucets are irrevocable once created
- **Approve & deposit** workflow: creator approves token transfer, then creates the faucet

## Architecture

```
Vercel Frontend (React + Vite + TypeScript)
    |
    ├── Vercel Edge Function (IP rate limiting)
    │       └── Vercel KV (claim tracking)
    |
    └── OPNet Blockchain (regtest)
            └── FaucetManager Smart Contract
```

## Project Structure

```
faucet-centralizator/
├── contract/          # AssemblyScript smart contract
│   ├── src/
│   │   ├── index.ts           # Entry point
│   │   └── FaucetManager.ts   # Core contract logic
│   └── build/                 # Compiled WASM output
├── frontend/          # React + Vite frontend
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── hooks/             # Custom hooks (useFaucets, useClaim, etc.)
│   │   ├── abi/               # Contract ABI definitions
│   │   ├── config/            # Network & contract config
│   │   ├── services/          # Provider singleton
│   │   └── styles/            # Global CSS (Neon Arcade theme)
│   ├── api/                   # Vercel Edge Functions
│   │   └── verify-claim.ts    # Anti-sybil IP check
│   └── vercel.json            # Vercel deployment config
├── scripts/           # Deployment scripts
│   └── deploy.ts              # Contract deployment via SDK
├── .env.example       # Environment template
└── CLAUDE.md          # AI assistant project rules
```

## Smart Contract

The **FaucetManager** contract (AssemblyScript compiled to WASM) supports:

| Method | Selector | Description |
|--------|----------|-------------|
| `createFaucet` | `address,uint256,uint256,uint8` | Create a new faucet (after token approval) |
| `claim` | `uint256` | Claim tokens from a faucet |
| `getFaucet` | `uint256` | Read faucet data by ID |
| `getFaucetCount` | — | Get total number of faucets |

**Cooldown types**: 0 = one-shot, 1 = hourly, 2 = 6h, 3 = 12h, 4 = daily

## Getting Started

### Prerequisites

- Node.js 18+
- An OPNet-compatible wallet (OP_WALLET)
- Regtest BTC for contract deployment

### Build the Contract

```bash
cd contract
npm install
npm run build
```

### Run the Frontend

```bash
cd frontend
npm install
npm run dev
```

### Deploy the Contract

1. Copy `.env.example` to `.env` and add your deployer mnemonic:
   ```
   DEPLOYER_MNEMONIC=your 24 word mnemonic phrase here
   ```

2. Build the contract first (see above)

3. Run the deploy script:
   ```bash
   cd scripts
   npm install
   npm run deploy
   ```

4. Update `frontend/src/config/contracts.ts` with the deployed contract address

### Deploy to Vercel

1. Push to GitHub
2. Import in Vercel, set root directory to `frontend/`
3. Create a Vercel KV store and link it to the project
4. Deploy

## Tech Stack

- **Smart Contract**: AssemblyScript + btc-runtime (OPNet)
- **Frontend**: React 19, TypeScript, Vite
- **Wallet**: @btc-vision/walletconnect v2 (OP_WALLET)
- **Blockchain SDK**: opnet npm package, @btc-vision/transaction
- **Anti-Sybil**: Vercel Edge Functions + Vercel KV
- **Deployment**: Vercel (frontend), OPNet regtest (contract)

## Network

- **Network**: OPNet Regtest
- **RPC**: `https://regtest.opnet.org`

## License

MIT
