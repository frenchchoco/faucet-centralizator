export const COOLDOWN_LABELS: Record<string, string> = {
    '0': 'One-shot', '3600': 'Hourly', '21600': '6 Hours',
    '43200': '12 Hours', '86400': 'Daily',
};

export function getCooldownLabel(seconds: bigint): string {
    if (seconds >= 18446744073709551615n) return 'One-shot';
    return COOLDOWN_LABELS[seconds.toString()] ?? `${seconds}s`;
}

export function formatTokenAmount(amount: bigint, decimals: number): string {
    const divisor = 10n ** BigInt(decimals);
    const whole = amount / divisor;
    const frac = amount % divisor;
    if (frac === 0n) return whole.toString();
    return `${whole}.${frac.toString().padStart(decimals, '0').replace(/0+$/, '')}`;
}

export function parseAmount(value: string, decimals: number): bigint {
    if (!value || value === '0') return 0n;
    const [whole = '0', rawFrac = ''] = value.split('.');
    const frac = rawFrac.length > decimals ? rawFrac.slice(0, decimals) : rawFrac.padEnd(decimals, '0');
    return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac);
}

export function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}
