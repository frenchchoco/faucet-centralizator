# Free Faucet - Design Document

**Date:** 2026-02-22
**Status:** Approved

## Overview

A decentralized dapp where anyone can create a faucet for any OP20 token on OPNet. The dapp serves as a central hub for all faucets. Creators pick a token, deposit an amount, configure distribution, and the faucet goes live. Users claim tokens respecting cooldown rules.

## Architecture

```
┌─────────────────────────────────────────┐
│              Vercel Frontend             │
│         React + Vite + TypeScript        │
├─────────────────────────────────────────┤
│   Vercel Edge Function (anti-sybil IP)  │
│         + Vercel KV (IP tracking)        │
├─────────────────────────────────────────┤
│         OPNet Blockchain (regtest)       │
│    FaucetManager Smart Contract (OP20)   │
└─────────────────────────────────────────┘
```

## Smart Contract: FaucetManager

### Storage

- `faucetCount: u256` — auto-increment ID
- `faucets: Map<u256, FaucetData>` — faucetId to data
- `lastClaim: Map<u256, Map<Address, u64>>` — faucetId to claimer to timestamp

### FaucetData

| Field | Type | Description |
|-------|------|-------------|
| tokenAddress | Address | OP20 token contract address |
| creator | Address | Faucet creator address |
| totalDeposited | u256 | Total tokens deposited |
| remainingBalance | u256 | Remaining token balance |
| amountPerClaim | u256 | Tokens per claim |
| cooldownSeconds | u64 | Cooldown in seconds (0 = one-shot) |
| active | bool | False when balance < amountPerClaim |

### Functions

| Function | Description |
|----------|-------------|
| `createFaucet(token, totalAmount, amountPerClaim, cooldownType)` | Requires prior approve. Does transferFrom, creates faucet. |
| `claim(faucetId)` | Verifies cooldown, transfers amountPerClaim to caller. |
| `getFaucet(faucetId)` | Returns faucet data (view). |
| `getFaucetCount()` | Returns total faucet count (view). |

### Cooldown Types

| Type | Value | Seconds |
|------|-------|---------|
| One-shot | 0 | Permanent block after 1 claim |
| Hourly | 1 | 3600 |
| Every 6h | 2 | 21600 |
| Every 12h | 3 | 43200 |
| Daily | 4 | 86400 |

### Security

- No admin key, no owner privileges. Fully permissionless.
- Faucets are irrevocable. No withdrawal after creation.
- One-shot claims store `u64.MAX` as lastClaim timestamp (permanent block).
- Faucet auto-deactivates when remainingBalance < amountPerClaim.
- Cooldown enforced on-chain per address per faucet.

## Frontend

### Tech Stack

- React 18 + Vite + TypeScript (OPNet TypeScript Law 2026)
- @btc-vision/walletconnect v2 for wallet connection
- opnet package for contract interactions (getContract, simulate, sendTransaction)
- CSS with fun/colorful theme
- Deployed on Vercel

### Routes

| Route | Description |
|-------|-------------|
| `/` | Main page — grid of faucet cards |
| `/create` | Faucet creation form |
| `/faucet/:id` | Faucet detail + claim button |

### Components

```
src/
├── components/
│   ├── FaucetCard.tsx          — Card showing faucet info
│   ├── FaucetGrid.tsx          — Grid of all faucet cards
│   ├── CreateFaucetForm.tsx    — Creation form
│   ├── ClaimButton.tsx         — Claim with cooldown state
│   ├── WalletConnect.tsx       — Wallet connection
│   ├── Header.tsx              — Nav + wallet
│   └── TokenInfo.tsx           — Token name/symbol from contract
├── hooks/
│   ├── useFaucetContract.ts    — FaucetManager contract instance
│   ├── useFaucets.ts           — List all faucets
│   ├── useFaucet.ts            — Single faucet data
│   ├── useClaim.ts             — Claim logic + cooldown
│   └── useTokenInfo.ts         — Token name/symbol/decimals
├── config/
│   └── contracts.ts            — FaucetManager address per network
├── abi/
│   ├── FaucetManagerABI.ts
│   └── OP20ABI.ts
└── styles/
```

### User Flows

**Create a faucet:**
1. Connect wallet
2. Navigate to `/create`
3. Enter OP20 token address — frontend displays name/symbol/decimals
4. Enter total amount, amount per claim, choose frequency
5. Click "Approve" — approve token to FaucetManager
6. Click "Create Faucet" — calls createFaucet() (simulate + send)
7. Redirect to `/` with new card

**Claim from a faucet:**
1. Connect wallet
2. Click "Claim" on a faucet card or `/faucet/:id`
3. Frontend calls Vercel Edge Function for IP check
4. If IP check passes, call claim(faucetId) on-chain (simulate + send)
5. Display result (confetti on success)

### Visual Design

- Animated gradient background (purple → blue → pink)
- Cards with colored borders, hover scale + glow
- Progress bar for remaining balance
- Frequency icons (clock, fire, etc.)
- Confetti animation on successful claim
- Bold, playful typography

## Anti-Sybil Protection

### Layer 1: On-chain (smart contract)
- 1 claim per address per cooldown period
- Enforced in the `claim()` function

### Layer 2: IP-based (Vercel Edge)
- Vercel Edge Function checks requester IP
- Vercel KV stores: `{faucetId}:{ip}` → last claim timestamp
- 1 claim per IP per cooldown period
- No admin key required — fully automatic
- Frontend must get a "claim token" from edge function before on-chain claim

### Flow

```
User clicks Claim
  → Frontend calls /api/verify-claim (Edge Function)
    → Edge checks IP in Vercel KV
    → If cooldown OK: returns signed claim nonce
    → If not: returns error with remaining time
  → Frontend calls claim(faucetId) on-chain
  → Contract checks address cooldown
  → Tokens transferred
```

## Deployment

- **GitHub:** Public repository for dapp contest
- **Vercel:** Auto-deploy from GitHub main branch
- **Network:** OPNet regtest (RPC: https://regtest.opnet.org)
