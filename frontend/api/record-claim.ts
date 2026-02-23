export const config = { runtime: 'edge' };

const ONE_YEAR = 365 * 24 * 3600;

async function redisSetEx(key: string, value: number, ttl: number): Promise<void> {
    const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
    if (!url || !token) return;
    await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['SET', key, String(value), 'EX', String(ttl)]),
    });
}

export default async function handler(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown';

    let body: { faucetId: string; cooldownSeconds: number };
    try {
        body = (await request.json()) as { faucetId: string; cooldownSeconds: number };
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const { faucetId, cooldownSeconds } = body;
    if (!faucetId || cooldownSeconds === undefined) {
        return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    try {
        const ttl = (cooldownSeconds === 0 || cooldownSeconds > ONE_YEAR) ? ONE_YEAR : cooldownSeconds;
        await redisSetEx(`claim:${faucetId}:${ip}`, Math.floor(Date.now() / 1000), ttl);
    } catch {
        // Best-effort
    }

    return new Response(JSON.stringify({ recorded: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
