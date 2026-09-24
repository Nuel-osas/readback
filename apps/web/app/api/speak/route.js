// The agent's voice. ElevenLabs text to speech, streamed back as mp3. The
// browser falls back to its own speech synthesis if this is unavailable.
export const dynamic = 'force-dynamic';
const VOICE = 'nPczCjzI2devNBz1zQrb'; // Brian: calm, flat, clear. A safety voice, not a sales one.

export async function POST(req) {
  const { text } = await req.json();
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key || !text) return new Response(null, { status: 204 });
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/stream?optimize_streaming_latency=3`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5', voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.2 } }),
  });
  if (!r.ok) return new Response(null, { status: 204 });
  return new Response(r.body, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } });
}
