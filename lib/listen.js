/**
 * One listening session: microphone into AssemblyAI Universal-Streaming.
 *
 * Partial transcripts stream in as the user speaks; a turn is final when the
 * model's end-of-turn detection says the user has finished, not when a fixed
 * silence timer runs out. That is what lets a readback feel like a conversation.
 */
import { KEYTERMS } from './tokens.js';

export async function listen({ onPartial, onTurn, onLevel, onError, onState }) {
  onState?.('connecting');
  const tok = await fetch('/api/aai-token').then((r) => r.json());
  if (!tok.token) throw new Error(tok.error || 'no streaming token');

  const params = new URLSearchParams({
    sample_rate: '16000',
    encoding: 'pcm_s16le',
    format_turns: 'true',
    speech_model: 'universal-3-5-pro',
    // Wallet vocabulary, so "USDC" and "cbBTC" are heard as tickers. The whole
    // registry, never the tokens in the transaction under review: priming with
    // those would bias the transcript toward agreeing with the transaction.
    keyterms_prompt: JSON.stringify(KEYTERMS),
    // A user reading out an amount or an address pauses mid-sentence. Don't
    // cut them off.
    min_turn_silence: '560',
    token: tok.token,
  });
  const ws = new WebSocket(`wss://streaming.assemblyai.com/v3/ws?${params}`);
  ws.binaryType = 'arraybuffer';

  const media = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const ctx = new AudioContext();
  await ctx.audioWorklet.addModule('/pcm-worklet.js');
  const src = ctx.createMediaStreamSource(media);
  const node = new AudioWorkletNode(ctx, 'pcm-worklet');
  src.connect(node);

  let open = false;
  node.port.onmessage = (e) => {
    onLevel?.(e.data.level);
    if (open && ws.readyState === 1) ws.send(e.data.pcm);
  };

  ws.onopen = () => { open = true; onState?.('listening'); };
  ws.onerror = () => onError?.(new Error('streaming connection failed'));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'Turn') {
      if (m.end_of_turn && m.turn_is_formatted) onTurn?.(m.transcript, m);
      else if (!m.end_of_turn) onPartial?.(m.transcript);
    } else if (m.type === 'Error' || m.error) {
      onError?.(new Error(m.error || 'streaming error'));
    }
  };

  const stop = () => {
    open = false;
    try { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'Terminate' })); } catch {}
    try { ws.close(); } catch {}
    media.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
    onState?.('idle');
  };
  return { stop, mute: (m) => { open = !m && ws.readyState === 1; } };
}
