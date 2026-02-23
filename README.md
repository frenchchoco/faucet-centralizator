# Faucet Centralizator

Decentralized OP20 token faucet platform on OPNet (Bitcoin Layer 1). Anyone can create a faucet for any OP20 token, and users can claim tokens from a central hub.

**🚀 Live Demo:** [frontend-nine-beige-72.vercel.app](https://frontend-nine-beige-72.vercel.app)

Built for the [vibecode.finance](https://vibecodedotfinance.vercel.app) OPNet dapp contest.

## Features

- **Create faucets** for any OP20 token by contract address
- **Configurable cooldowns**: hourly, 6h, 12h, daily, or one-shot
- **Fully on-chain**: FaucetManager smart contract manages all state
- **Anti-sybil**: IP-based rate limiting via Vercel Edge Functions + Upstash Redis
- **No admin keys**: Faucets are irrevocable once created
- **Approve & deposit** workflow: creator approves token transfer, then creates the faucet
- **Multi-network**: supports regtest, testnet, and mainnet via environment variable

## One-Command Deploy

```bash
git clone https://github.com/frenchchoco/faucet-centralizator.git
cd faucet-centralizator
npm run deploy
```

That's it. The script handles everything automatically:

1. Generates a deployer wallet (or uses existing `.env` mnemonic)
2. Installs all dependencies (contract, frontend, scripts)
3. Builds the smart contract WASM
4. Shows your P2TR address — fund it at https://faucet.opnet.org
5. Polls for on-chain funding confirmation
6. Deploys the FaucetManager contract
7. Updates the frontend with the deployed contract address (per-network)
8. Builds the frontend
9. Deploys to Vercel (auto-links if needed)
10. Commits & pushes the contract address to GitHub

The only manual step is funding your wallet with rBTC from the faucet.

For regtest: `npm run deploy:regtest`
For mainnet: `npm run deploy:mainnet`

## Architecture

```
Vercel Frontend (React + Vite + TypeScript)
    |
    ├── Vercel Edge Function (IP rate limiting)
    │       └── Upstash Redis (claim tracking)
    |
    └── OPNet Blockchain (testnet / regtest / mainnet)
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
│   │   ├── config/            # Network & contract config (multi-network)
│   │   ├── services/          # Provider singleton
│   │   └── styles/            # Global CSS (Neon Arcade theme)
│   ├── api/                   # Vercel Edge Functions
│   │   ├── verify-claim.ts    # Anti-sybil IP check
│   │   ├── record-claim.ts    # Record claim after on-chain success
│   │   └── flush-claims.ts    # Purge all rate-limit entries (admin)
│   └── vercel.json            # Vercel deployment config
├── scripts/           # Deploy-all pipeline
│   └── deploy.ts              # Fully automated deployment script
├── package.json       # Root — npm run deploy
└── .env.example       # Environment template
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

## Development

### Prerequisites

- Node.js 18+
- An OPNet-compatible wallet (OP_WALLET)

### Local Development

```bash
# Run frontend dev server (defaults to testnet)
npm run dev

# Run on a different network
VITE_NETWORK=regtest npm run dev

# Build contract only
npm run build:contract

# Build frontend only
npm run build:frontend
```

### Network Configuration

The frontend network is controlled by the `VITE_NETWORK` environment variable:

| Value | Network | RPC | Block interval |
|-------|---------|-----|----------------|
| `testnet` (default) | OPNet Testnet | `https://testnet.opnet.org` | ~2 min |
| `regtest` | OPNet Regtest | `https://regtest.opnet.org` | ~10 min |
| `mainnet` | OPNet Mainnet | `https://api.opnet.org` | ~10 min |

Set it in Vercel dashboard → Settings → Environment Variables, or in `.env`:
```
VITE_NETWORK=testnet
```

## Tech Stack

- **Smart Contract**: AssemblyScript + btc-runtime (OPNet)
- **Frontend**: React 19, TypeScript, Vite
- **Wallet**: @btc-vision/walletconnect v2 (OP_WALLET)
- **Blockchain SDK**: opnet npm package, @btc-vision/transaction
- **Anti-Sybil**: Vercel Edge Functions + Upstash Redis
- **Deployment**: Vercel (frontend), OPNet testnet (contract)

## Anti-Sybil: Upstash Redis Setup

The faucet uses IP-based rate limiting via Vercel Edge Functions + [Upstash Redis](https://upstash.com) to prevent abuse. Each claim is tracked per IP per faucet.

### Setup

1. Create an [Upstash Redis](https://upstash.com) database (free tier works)
2. Add `KV_REST_API_URL` and `KV_REST_API_TOKEN` to your Vercel project environment variables
3. Redeploy: `npx vercel --prod`

That's it. The Edge Functions (`/api/verify-claim`, `/api/record-claim`) use the Upstash REST API and auto-read these env vars.

### How It Works

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/verify-claim` | POST | Checks if the caller's IP can claim (returns `{ allowed, remainingSeconds }`) |
| `/api/record-claim` | POST | Records a successful claim for the IP (TTL = cooldown duration) |
| `/api/flush-claims` | POST | Purges all rate-limit entries (admin) |

The frontend calls `verify-claim` **before** sending the on-chain TX, and `record-claim` **after** success. If Redis is not configured, the check gracefully falls back to allow (no blocking).

### Current Deployment

- **URL**: https://frontend-nine-beige-72.vercel.app
- **Flush endpoint**: `curl -X POST https://frontend-nine-beige-72.vercel.app/api/flush-claims`

## Networks

| Command | Network | RPC |
|---------|---------|-----|
| `npm run deploy` | **Testnet** (default, contest) | `https://testnet.opnet.org` |
| `npm run deploy:regtest` | Regtest | `https://regtest.opnet.org` |
| `npm run deploy:mainnet` | Mainnet | `https://api.opnet.org` |

## License

MIT

---

Built with [BobOS](https://github.com/AustinZhu/BobOS), the best
