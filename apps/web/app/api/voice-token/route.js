// A short-lived token so the browser can open the AssemblyAI Voice Agent WebSocket
// directly, without ever holding the API key.
export const dynamic = 'force-dynamic';

export async function GET() {
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) return Response.json({ error: 'ASSEMBLYAI_API_KEY is not set' }, { status: 503 });
  const r = await fetch('https://agents.assemblyai.com/v1/token?expires_in_seconds=300', { headers: { authorization: `Bearer ${key}` }, cache: 'no-store' });
  if (!r.ok) return Response.json({ error: `token ${r.status}` }, { status: 502 });
  return Response.json(await r.json());
}
