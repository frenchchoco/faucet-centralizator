import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { Link } from 'react-router-dom';
import { useFaucets } from '../hooks/useFaucets.js';
import { useTokenInfoMap } from '../hooks/useTokenInfoMap.js';
import { useHasPendingClaims } from '../hooks/usePendingClaims.js';
import { BLOCK_INTERVAL_SECONDS } from '../config/networks.js';
import type { FaucetData } from '../hooks/useFaucets.js';
import { FaucetCard } from './FaucetCard.js';

/* ── Skeleton placeholder ────────────────────────────────── */
function SkeletonCard(): React.JSX.Element {
    return (
        <div className="faucet-card skeleton-card">
            <div className="skeleton-line skeleton-title" />
            <div className="skeleton-line skeleton-bar" />
            <div className="skeleton-line skeleton-text" />
            <div className="skeleton-line skeleton-text short" />
            <div className="skeleton-line skeleton-btn" />
        </div>
    );
}

/* ── Filter / sort types ─────────────────────────────────── */
type StatusFilter = 'all' | 'active' | 'depleted';
type SortKey = 'newest' | 'remaining' | 'per-claim' | 'depleted-last';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
    { value: 'depleted-last', label: 'Active first' },
    { value: 'newest', label: 'Newest' },
    { value: 'remaining', label: 'Most remaining' },
    { value: 'per-claim', label: 'Highest per claim' },
];

/* ── Refetch schedule ─────────────────────────────────────── */
const FIRST_RETRY_MS = 10_000;                           // 10s — catch fast blocks
const BLOCK_RETRY_MS = BLOCK_INTERVAL_SECONDS * 1000;    // 120s testnet / 600s regtest
const MAX_RETRIES = 5;

/* ── Main component ──────────────────────────────────────── */
export function FaucetGrid(): React.JSX.Element {
    const { faucets, loading, error, refetch, silentRefetch } = useFaucets();
    const hasPending = useHasPendingClaims();
    const retryTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

    /** Schedule a series of silent refetches after a claim */
    const scheduleRefetches = useCallback(() => {
        // Clear any existing timers
        for (const t of retryTimers.current) clearTimeout(t);
        retryTimers.current = [];

        // First quick check at 10s, then every block interval
        retryTimers.current.push(setTimeout(silentRefetch, FIRST_RETRY_MS));
        for (let i = 1; i <= MAX_RETRIES; i++) {
            retryTimers.current.push(
                setTimeout(silentRefetch, FIRST_RETRY_MS + BLOCK_RETRY_MS * i),
            );
        }
    }, [silentRefetch]);

    // Clean up timers on unmount
    useEffect(() => {
        return () => { for (const t of retryTimers.current) clearTimeout(t); };
    }, []);

    // Stop retrying once pending claims are reconciled
    useEffect(() => {
        if (!hasPending && retryTimers.current.length > 0) {
            for (const t of retryTimers.current) clearTimeout(t);
            retryTimers.current = [];
        }
    }, [hasPending]);

    /** Called after a successful claim — kick off the refetch schedule */
    const delayedRefetch = useCallback(() => {
        scheduleRefetches();
    }, [scheduleRefetches]);

    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [tokenFilter, setTokenFilter] = useState<string>('all');
    const [sortKey, setSortKey] = useState<SortKey>('depleted-last');

    /* Collect unique token addresses for batch info fetch */
    const uniqueAddresses = useMemo(
        () => [...new Set(faucets.map((f) => f.tokenAddress.toHex()))],
        [faucets],
    );
    const tokenInfoMap = useTokenInfoMap(uniqueAddresses);

    /* Build token filter options */
    const tokenOptions = useMemo(() => {
        const opts: { address: string; label: string }[] = [];
        for (const addr of uniqueAddresses) {
            const info = tokenInfoMap.get(addr);
            opts.push({ address: addr, label: info ? `${info.symbol}` : addr.slice(0, 10) + '…' });
        }
        return opts.sort((a, b) => a.label.localeCompare(b.label));
    }, [uniqueAddresses, tokenInfoMap]);

    /** A faucet is effectively depleted when inactive OR not enough balance for a claim */
    const isEffectivelyActive = (f: FaucetData) => f.active && f.remainingBalance >= f.amountPerClaim;

    /* Apply filters */
    const filtered = useMemo(() => {
        let result: FaucetData[] = [...faucets];

        if (statusFilter === 'active') result = result.filter((f) => isEffectivelyActive(f));
        else if (statusFilter === 'depleted') result = result.filter((f) => !isEffectivelyActive(f));

        if (tokenFilter !== 'all') result = result.filter((f) => f.tokenAddress.toHex() === tokenFilter);

        /* Sort */
        switch (sortKey) {
            case 'newest':
                result.sort((a, b) => b.id - a.id);
                break;
            case 'remaining':
                result.sort((a, b) => (b.remainingBalance > a.remainingBalance ? 1 : b.remainingBalance < a.remainingBalance ? -1 : 0));
                break;
            case 'per-claim':
                result.sort((a, b) => (b.amountPerClaim > a.amountPerClaim ? 1 : b.amountPerClaim < a.amountPerClaim ? -1 : 0));
                break;
            case 'depleted-last':
                result.sort((a, b) => {
                    const aActive = isEffectivelyActive(a);
                    const bActive = isEffectivelyActive(b);
                    if (aActive !== bActive) return aActive ? -1 : 1;
                    return b.id - a.id;
                });
                break;
        }

        return result;
    }, [faucets, statusFilter, tokenFilter, sortKey]);

    const showToolbar = !loading && !error && faucets.length > 0;

    return (
        <div className="faucet-grid-wrapper">
            {/* ── Hero ───────────────────────────────────────── */}
            <section className="hero">
                <h1 className="hero-title">Claim Free OP20 Tokens on Bitcoin</h1>
                <p className="hero-subtitle">
                    Anyone can create a faucet for any token. Fully on-chain, no admin keys, powered by OPNet.
                </p>
                <div className="hero-actions">
                    <Link to="/create" className="btn btn-primary hero-btn">Create a Faucet</Link>
                </div>
            </section>

            <h2 className="page-title" id="faucets">Available Faucets</h2>

            {/* ── Filter / Sort toolbar ──────────────────────── */}
            {showToolbar && (
                <div className="filter-toolbar">
                    {/* Status pills */}
                    <div className="filter-group">
                        {(['all', 'active', 'depleted'] as StatusFilter[]).map((s) => (
                            <button
                                key={s}
                                className={`filter-pill${statusFilter === s ? ' filter-pill-active' : ''}`}
                                onClick={() => setStatusFilter(s)}
                            >
                                {s === 'all' ? 'All' : s === 'active' ? '● Active' : '○ Depleted'}
                            </button>
                        ))}
                    </div>

                    <div className="filter-group filter-selects">
                        {/* Token dropdown */}
                        {tokenOptions.length > 1 && (
                            <select
                                className="filter-select"
                                value={tokenFilter}
                                onChange={(e) => setTokenFilter(e.target.value)}
                            >
                                <option value="all">All tokens</option>
                                {tokenOptions.map((t) => (
                                    <option key={t.address} value={t.address}>{t.label}</option>
                                ))}
                            </select>
                        )}

                        {/* Sort dropdown */}
                        <select
                            className="filter-select"
                            value={sortKey}
                            onChange={(e) => setSortKey(e.target.value as SortKey)}
                        >
                            {SORT_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>
                </div>
            )}

            {/* ── Content ────────────────────────────────────── */}
            {loading ? (
                <div className="faucet-grid">
                    <SkeletonCard /><SkeletonCard /><SkeletonCard />
                </div>
            ) : error ? (
                <div className="error-state">
                    <p>Error: {error}</p>
                    <button className="btn" onClick={() => void refetch()}>Retry</button>
                </div>
            ) : faucets.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon">🚰</div>
                    <p>No faucets yet.</p>
                    <p className="empty-hint">Be the first to create one!</p>
                    <Link to="/create" className="btn btn-primary" style={{ marginTop: '1rem', display: 'inline-block' }}>Create a Faucet</Link>
                </div>
            ) : filtered.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon">🔍</div>
                    <p>No faucets match your filters.</p>
                    <button className="btn" style={{ marginTop: '1rem' }} onClick={() => { setStatusFilter('all'); setTokenFilter('all'); }}>
                        Clear filters
                    </button>
                </div>
            ) : (
                <div className="faucet-grid">
                    {filtered.map((f) => <FaucetCard key={f.id} faucet={f} onClaimed={delayedRefetch} />)}
                </div>
            )}
        </div>
    );
}
