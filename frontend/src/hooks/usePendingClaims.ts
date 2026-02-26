import { useSyncExternalStore } from 'react';
import { BLOCK_INTERVAL_SECONDS } from '../config/networks.js';

/* ── Types ────────────────────────────────────────────────── */

interface PendingEntry {
    faucetId: number;
    amount: string;   // bigint serialised as string
    txId: string;
    timestamp: number; // Date.now()
}

export interface PendingInfo {
    count: number;
    amount: bigint;
}

/* ── localStorage helpers ─────────────────────────────────── */

const STORAGE_KEY = 'pending-claims';
const MAX_AGE_MS = BLOCK_INTERVAL_SECONDS * 10 * 1000; // auto-expire stale entries

let listeners: Array<() => void> = [];
function emit() { for (const l of listeners) l(); }

function readEntries(): PendingEntry[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const entries = JSON.parse(raw) as PendingEntry[];
        const cutoff = Date.now() - MAX_AGE_MS;
        return entries.filter((e) => e.timestamp > cutoff);
    } catch { return []; }
}

function writeEntries(entries: PendingEntry[]): void {
    try {
        if (entries.length === 0) localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch { /* quota exceeded */ }
    emit();
}

/* ── Public API ────────────────────────────────────────────── */

export function addPending(faucetId: number, amount: bigint, txId: string): void {
    const entries = readEntries();
    entries.push({ faucetId, amount: amount.toString(), txId, timestamp: Date.now() });
    writeEntries(entries);
}

export function removePendingForFaucet(faucetId: number, count?: number): void {
    const entries = readEntries();
    if (count === undefined) {
        writeEntries(entries.filter((e) => e.faucetId !== faucetId));
    } else {
        let removed = 0;
        const kept: PendingEntry[] = [];
        for (const e of entries) {
            if (e.faucetId === faucetId && removed < count) { removed++; continue; }
            kept.push(e);
        }
        writeEntries(kept);
    }
}

export function getPendingForFaucet(faucetId: number): PendingInfo {
    const entries = readEntries().filter((e) => e.faucetId === faucetId);
    return {
        count: entries.length,
        amount: entries.reduce((sum, e) => sum + BigInt(e.amount), 0n),
    };
}

export function hasPendingClaims(): boolean {
    return readEntries().length > 0;
}

/* ── React hook ────────────────────────────────────────────── */

function subscribe(cb: () => void) {
    listeners.push(cb);
    return () => { listeners = listeners.filter((l) => l !== cb); };
}

function getSnapshot(): string {
    try { return localStorage.getItem(STORAGE_KEY) ?? ''; }
    catch { return ''; }
}

export function usePendingClaims(faucetId: number): PendingInfo {
    // Re-render when localStorage changes
    useSyncExternalStore(subscribe, getSnapshot);

    return getPendingForFaucet(faucetId);
}

/** Returns true if any faucet has pending claims — useful for scheduling refetches */
export function useHasPendingClaims(): boolean {
    useSyncExternalStore(subscribe, getSnapshot);
    return hasPendingClaims();
}

