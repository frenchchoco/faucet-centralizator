import { kv } from '@vercel/kv';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    const keys: string[] = [];
    let cursor = 0 as number | string;
    let scanResult: [string, string[]];
    do {
        scanResult = (await kv.scan(cursor, { match: 'claim:*', count: 100 })) as [string, string[]];
        cursor = scanResult[0];
        keys.push(...scanResult[1]);
    } while (cursor !== '0' && cursor !== 0);

    if (keys.length > 0) await kv.del(...keys);

    return new Response(JSON.stringify({ flushed: keys.length, keys }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
