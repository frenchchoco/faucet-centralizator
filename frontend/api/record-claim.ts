import { kv } from '@vercel/kv';

export const config = { runtime: 'edge' };

const ONE_YEAR = 365 * 24 * 3600;

export default async function handler(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown';
    const { faucetId, cooldownSeconds } = (await request.json()) as { faucetId: string; cooldownSeconds: number };

    if (!faucetId || cooldownSeconds === undefined) {
        return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const ttl = (cooldownSeconds === 0 || cooldownSeconds > ONE_YEAR) ? ONE_YEAR : cooldownSeconds;
    await kv.set(`claim:${faucetId}:${ip}`, Math.floor(Date.now() / 1000), { ex: ttl });

    return new Response(JSON.stringify({ recorded: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
