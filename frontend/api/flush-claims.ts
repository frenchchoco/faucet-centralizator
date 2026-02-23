export const config = { runtime: 'edge' };

async function redisCommand(cmd: string[]): Promise<unknown> {
    const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
    if (!url || !token) throw new Error('Redis not configured');
    const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cmd),
    });
    const data = (await res.json()) as { result: unknown };
    return data.result;
}

export default async function handler(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    try {
        const keys: string[] = [];
        let cursor = '0';
        do {
            const result = (await redisCommand(['SCAN', cursor, 'MATCH', 'claim:*', 'COUNT', '100'])) as [string, string[]];
            cursor = String(result[0]);
            keys.push(...result[1]);
        } while (cursor !== '0');

        if (keys.length > 0) await redisCommand(['DEL', ...keys]);

        return new Response(JSON.stringify({ flushed: keys.length, keys }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (err) {
        return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
}
