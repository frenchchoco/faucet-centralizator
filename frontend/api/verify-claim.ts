export const config = { runtime: 'edge' };

const ONE_YEAR = 365 * 24 * 3600;
const isOneShot = (cd: number) => cd === 0 || cd > ONE_YEAR;

async function redisGet(key: string): Promise<number | null> {
    const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
    if (!url || !token) return null;
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json()) as { result: string | null };
    return data.result ? Number(data.result) : null;
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
        const lastClaim = await redisGet(`claim:${faucetId}:${ip}`);
        if (lastClaim) {
            const elapsed = Math.floor(Date.now() / 1000) - lastClaim;
            const effective = isOneShot(cooldownSeconds) ? Infinity : cooldownSeconds;
            if (elapsed < effective) {
                return new Response(
                    JSON.stringify({ allowed: false, remainingSeconds: effective - elapsed }),
                    { status: 429, headers: { 'Content-Type': 'application/json' } },
                );
            }
        }
    } catch {
        // Redis unavailable — allow claim
    }

    return new Response(JSON.stringify({ allowed: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
