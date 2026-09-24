/**
 * One Readback conversation over the AssemblyAI Voice Agent API.
 *
 * The agent is the ear and the voice, never the judge. It hears the signer, records
 * what they said through the report_intent tool, and speaks back exactly the sentence
 * the notary returns. It is never shown the transaction, so it cannot be talked into
 * agreeing with it, and nothing it says can release a signature: that is decided by
 * the notary's verdict in code.
 */
import schema from '@readback/core/schema/intent.json';

const props = { ...schema.properties };
delete props.confirm;

export const SYSTEM_PROMPT = `You are Readback, a safety check that runs before a crypto wallet signs a transaction.
You do not know what the transaction contains, and you must never guess or describe it.
When the user says what they are signing, call report_intent immediately, recording their words faithfully. Leave a field null when they did not say it. Never invent amounts, tokens or recipients.
When a tool returns a "say" field, speak it exactly, word for word, and nothing else. Do not add, soften, summarise or reassure.
After a match, when the user says confirm or cancel, call report_decision.`;

export const TOOLS = [
  { type: 'function', name: 'report_intent', execution_mode: 'hold', timeout_seconds: 30,
    description: 'Record what the user says they are about to sign. Call once, as soon as they have said it.',
    parameters: { type: 'object', properties: props, required: ['action'] } },
  { type: 'function', name: 'report_decision', execution_mode: 'hold', timeout_seconds: 30,
    description: 'Record whether the user confirmed or cancelled, after being told the transaction matches.',
    parameters: { type: 'object', properties: { decision: { type: 'string', enum: ['confirm', 'cancel'] } }, required: ['decision'] } },
];

const b64 = (buf) => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };

export async function startReadback({ greeting = 'What are you signing?', onEvent }) {
  let onTurnRef = () => {};
  const emit = (type, data = {}) => { onTurnRef(type); onEvent?.({ type, t: performance.now(), ...data }); };
  const tok = await fetch('/api/voice-token').then((r) => r.json());
  if (!tok.token) throw new Error(tok.error || 'no voice token');

  const media = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const micCtx = new AudioContext();
  await micCtx.audioWorklet.addModule('/pcm-worklet.js');
  const node = new AudioWorkletNode(micCtx, 'pcm-worklet');
  micCtx.createMediaStreamSource(media).connect(node);

  const outCtx = new AudioContext({ sampleRate: 24000 });
  // Browsers may start audio contexts suspended. Ask for both to run; this is called from a
  // click, which is the gesture they want.
  micCtx.resume().catch(() => {}); outCtx.resume().catch(() => {});
  let playhead = 0, sources = [], wasSpeaking = false, replyDone = true;
  const silence = new ArrayBuffer(4800);

  // "Is the agent audibly speaking?" is read off the audio clock every frame, never from
  // callbacks alone. If playback is not running at all (a suspended context), the agent
  // cannot be heard, so the mic is never muted: a stuck flag must not leave Readback deaf.
  const agentAudible = () => outCtx.state === 'running' && outCtx.currentTime < playhead + 0.05;

  const ws = new WebSocket(`wss://agents.assemblyai.com/v1/ws?token=${encodeURIComponent(tok.token)}`);
  let ready = false;

  node.port.onmessage = (e) => {
    const speaking = agentAudible();
    if (wasSpeaking && !speaking && replyDone) emit('agent.silent');
    wasSpeaking = speaking;
    emit('level', { level: speaking ? 0 : e.data.level });
    if (!ready || ws.readyState !== 1) return;
    // While the agent is talking, send silence instead of the mic, so on laptop
    // speakers it never hears itself and cuts off its own verdict.
    ws.send(JSON.stringify({ type: 'input.audio', audio: b64(speaking ? silence : e.data.pcm) }));
  };

  const play = (data) => {
    const pcm = new Int16Array(unb64(data));
    const buf = outCtx.createBuffer(1, pcm.length, 24000);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
    const src = outCtx.createBufferSource();
    src.buffer = buf; src.connect(outCtx.destination);
    const at = Math.max(outCtx.currentTime + 0.03, playhead);
    src.start(at); playhead = at + buf.duration; sources.push(src);
    src.onended = () => { sources = sources.filter((s) => s !== src); };
  };

  ws.onopen = () => ws.send(JSON.stringify({ type: 'session.update', session: {
    system_prompt: SYSTEM_PROMPT, greeting,
    input: { format: { encoding: 'audio/pcm' }, turn_detection: { min_silence: 400, max_silence: 1600, interrupt_response: false } },
    output: { voice: 'anna', format: { encoding: 'audio/pcm' } },
    tools: TOOLS,
  } }));

  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    switch (m.type) {
      case 'session.ready': case 'session.updated': ready = true; emit('ready'); break;
      case 'input.speech.started': emit('user.speaking'); break;
      case 'input.speech.stopped': emit('user.stopped'); break;
      case 'transcript.user.delta': emit('user.delta', { text: m.text }); break;
      case 'transcript.user': emit('user', { text: m.text }); break;
      case 'reply.started': replyDone = false; emit('agent.speaking'); break;
      case 'reply.audio': play(m.data); break;
      case 'reply.done':
        replyDone = true;
        emit('reply.done');
        // Nothing audible (suspended output, or already finished): the reply is over now.
        if (!agentAudible()) { wasSpeaking = false; emit('agent.silent'); }
        break;
      case 'transcript.agent': emit('agent', { text: m.text, interrupted: m.interrupted }); break;
      case 'tool.call': emit('tool', { callId: m.call_id, name: m.name, args: m.arguments }); break;
      case 'session.error': case 'error': emit('error', { message: m.message || m.code || 'voice error' }); break;
      default: break;
    }
  };
  ws.onerror = () => emit('error', { message: 'voice connection failed' });
  ws.onclose = () => emit('closed');

  const stop = () => {
    try { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'session.end' })); ws.close(); } catch {}
    sources.forEach((s) => { try { s.stop(); } catch {} });
    media.getTracks().forEach((t) => t.stop());
    micCtx.close().catch(() => {}); outCtx.close().catch(() => {});
  };
  // The API requires tool.result to be sent after the reply.done that closes the turn in
  // which the tool was called. A fast notary can answer before that; so answers wait.
  const pending = new Map();
  let turnClosed = false;
  const flush = () => { if (!turnClosed) return; for (const [id, r] of pending) { ws.readyState === 1 && ws.send(JSON.stringify({ type: 'tool.result', call_id: id, result: JSON.stringify(r) })); pending.delete(id); } };
  const answer = (callId, result) => { pending.set(callId, result); flush(); setTimeout(() => { turnClosed = true; flush(); }, 1500); };
  const onTurn = (type) => { if (type === 'tool') turnClosed = false; if (type === 'reply.done') { turnClosed = true; flush(); } };
  onTurnRef = onTurn;
  return { stop, answer };
}
