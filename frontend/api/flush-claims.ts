import { kv } from '@vercel/kv';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    const keys: string[] = [];
    let cursor = 0;
    do {
        const [next, batch] = await kv.scan(cursor, { match: 'claim:*', count: 100 });
        cursor = next;
        keys.push(...(batch as string[]));
    } while (cursor !== 0);

    if (keys.length > 0) await kv.del(...keys);

    return new Response(JSON.stringify({ flushed: keys.length, keys }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
