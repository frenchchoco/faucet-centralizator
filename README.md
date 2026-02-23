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
7. Updates the frontend with the deployed contract address
8. Builds the frontend
9. Deploys to Vercel (auto-links if needed)
10. Commits & pushes the contract address to GitHub

The only manual step is funding your wallet with regtest BTC from the faucet.

For testnet: `npm run deploy:testnet`
For mainnet: `npm run deploy:mainnet`

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
├── scripts/           # Deploy-all pipeline
│   └── deploy.ts              # Fully automated deployment script
├── package.json       # Root — npm run deploy
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

## Development

### Prerequisites

- Node.js 18+
- An OPNet-compatible wallet (OP_WALLET)

### Local Development

```bash
# Run frontend dev server
npm run dev

# Build contract only
npm run build:contract

# Build frontend only
npm run build:frontend
```

## Tech Stack

- **Smart Contract**: AssemblyScript + btc-runtime (OPNet)
- **Frontend**: React 19, TypeScript, Vite
- **Wallet**: @btc-vision/walletconnect v2 (OP_WALLET)
- **Blockchain SDK**: opnet npm package, @btc-vision/transaction
- **Anti-Sybil**: Vercel Edge Functions + Vercel KV
- **Deployment**: Vercel (frontend), OPNet regtest (contract)

## Networks

| Command | Network | RPC |
|---------|---------|-----|
| `npm run deploy` | **Regtest** (default, contest) | `https://regtest.opnet.org` |
| `npm run deploy:testnet` | Testnet | `https://testnet.opnet.org` |
| `npm run deploy:mainnet` | Mainnet | `https://api.opnet.org` |

## License

MIT

---

Built with [BobOS](https://github.com/AustinZhu/BobOS)
