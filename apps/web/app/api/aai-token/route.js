// Mints a short-lived AssemblyAI streaming token so the browser can open the
// WebSocket directly without ever holding the API key.
export const dynamic = 'force-dynamic';

export async function GET() {
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) return Response.json({ error: 'ASSEMBLYAI_API_KEY is not set' }, { status: 503 });
  const r = await fetch('https://streaming.assemblyai.com/v3/token?expires_in_seconds=600', { headers: { authorization: key }, cache: 'no-store' });
  if (!r.ok) return Response.json({ error: `token ${r.status}: ${await r.text()}` }, { status: 502 });
  return Response.json(await r.json());
}
