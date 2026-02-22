import { kv } from '@vercel/kv';

export const config = { runtime: 'edge' };

interface ClaimRequest {
    faucetId: string;
    cooldownSeconds: number;
}

export default async function handler(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const ip =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        request.headers.get('x-real-ip') ??
        'unknown';

    const body = (await request.json()) as ClaimRequest;
    const { faucetId, cooldownSeconds } = body;

    if (!faucetId || cooldownSeconds === undefined) {
        return new Response(JSON.stringify({ error: 'Missing fields' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
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
                {
                    status: 429,
                    headers: { 'Content-Type': 'application/json' },
                },
            );
        }
    }

    const now = Math.floor(Date.now() / 1000);
    // One-shot (cooldownSeconds=0) uses 1 year TTL
    const ttl = cooldownSeconds === 0 ? 365 * 24 * 3600 : cooldownSeconds;
    await kv.set(kvKey, now, { ex: ttl });

    return new Response(JSON.stringify({ allowed: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}
