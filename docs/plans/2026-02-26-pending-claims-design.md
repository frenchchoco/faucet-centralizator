# Pending Claims Indicator — Design

## Problem

After claiming tokens, the `remainingBalance` displayed on faucet cards doesn't update until the transaction is mined (~2min testnet, ~10min regtest). The current refetch delay of 2.5s is way too short — the TX is still in mempool.

## Solution

Track pending claims locally (localStorage) and display them visually on the progress bar + a badge. Increase refetch delay to match block interval.

## Data Layer

### Storage format

```
key: "pending-claims"
value: [{ faucetId: number, amount: string, txId: string, timestamp: number }]
```

### Hook: `usePendingClaims`

- `pendingForFaucet(faucetId): { count, amount }` — pending claims for a specific faucet
- `addPending(faucetId, amount, txId)` — called after successful claim in useClaim
- `removePending(faucetId, count?)` — purge entries after reconciliation
- Auto-expire entries older than 10 * BLOCK_INTERVAL_SECONDS (stale safety net)

### Reconciliation

In `useFaucets`, after each refetch: compare previous `remainingBalance` with new one. If balance dropped, purge matching pending entries (oldest first). Store previous balances in a ref.

## UI Changes

### Progress bar (FaucetCard + FaucetDetail)

Two sections inside the progress bar container:
1. **Confirmed** (existing): cyan-to-green gradient, width = `(remainingBalance / totalDeposited) * 100%`
2. **Pending** (new): striped animated pattern, semi-transparent orange/amber, width = `(pendingAmount / totalDeposited) * 100%`, positioned right after confirmed section

### Badge (FaucetCard)

Small amber badge next to existing active/depleted badge: "X pending" with pulse animation. Hidden when pendingCount === 0.

## Refetch Strategy

Replace the fixed 2.5s delay with a smarter retry schedule:
- First refetch at 10s (catch fast blocks)
- Then every BLOCK_INTERVAL_SECONDS (120s testnet / 600s regtest)
- Stop after pending claims are reconciled or after 5 retries max
- Use silentRefetch (no skeleton flash)

## Files to Modify

1. `frontend/src/hooks/usePendingClaims.ts` — NEW: pending claims hook
2. `frontend/src/hooks/useClaim.ts` — call addPending after successful claim
3. `frontend/src/hooks/useFaucets.ts` — reconciliation logic after refetch
4. `frontend/src/components/FaucetCard.tsx` — pending progress section + badge
5. `frontend/src/components/FaucetDetail.tsx` — pending progress section
6. `frontend/src/components/FaucetGrid.tsx` — new refetch schedule
7. `frontend/src/styles/global.css` — pending bar + badge styles
