// Measures the Voice Agent API as Readback's ear and voice, on real synthesized speech:
//   M5  intent extraction accuracy (tool call arguments vs expected)
//   M6  latency: end of user audio -> tool.call, and tool.result -> first audio of the verdict
//   M7  verdict fidelity: does the agent say the verdict sentence word for word?
import { readFileSync, writeFileSync } from 'node:fs';
const KEY = process.env.ASSEMBLYAI_API_KEY;
const schema = JSON.parse(readFileSync('../packages/core/schema/intent.json'));
const props = { ...schema.properties }; delete props.confirm;

export const SYSTEM = `You are Readback, a safety check that runs before a crypto wallet signs a transaction.
You do not know what the transaction contains, and you must never guess or describe it.
When the user says what they are signing, call report_intent immediately, recording their words faithfully. Leave a field null when they did not say it. Never invent amounts, tokens or recipients.
When report_intent returns, speak its "say" field exactly, word for word, and nothing else. Do not add, soften, summarise or reassure.`;

export const TOOLS = [{
  type: 'function', name: 'report_intent', execution_mode: 'hold', timeout_seconds: 30,
  description: 'Record what the user says they are about to sign. Call once, as soon as they have said it.',
  parameters: { type: 'object', properties: props, required: ['action'] },
}];

const U = JSON.parse(readFileSync('utterances.json'));
const b64 = (buf) => Buffer.from(buf).toString('base64');
const results = [];

async function runOne(u) {
  const { token } = await fetch('https://agents.assemblyai.com/v1/token?expires_in_seconds=120', { headers: { authorization: `Bearer ${KEY}` } }).then((r) => r.json());
  const ws = new WebSocket(`wss://agents.assemblyai.com/v1/ws?token=${encodeURIComponent(token)}`);
  const pcm = readFileSync(`audio/${u.id}.pcm`);
  const VERDICT = 'Stop. This test sentence must be spoken exactly as written.';
  const r = { id: u.id, text: u.text };
  let tAudioEnd, tTool, tResultSent, tFirstReply, pendingCall, greeted = false, sentAudio = false;

  return new Promise((resolve) => {
    const done = () => { try { ws.send(JSON.stringify({ type: 'session.end' })); ws.close(); } catch {} results.push(r); resolve(); };
    const timer = setTimeout(() => { r.error = 'timeout'; done(); }, 45000);

    const streamAudio = async () => {
      if (sentAudio) return; sentAudio = true;
      const chunk = 4800; // 100 ms at 24 kHz, 16-bit
      for (let i = 0; i < pcm.length; i += chunk) { ws.send(JSON.stringify({ type: 'input.audio', audio: b64(pcm.subarray(i, i + chunk)) })); await new Promise((s) => setTimeout(s, 100)); }
      tAudioEnd = Date.now();
      const silence = Buffer.alloc(chunk);
      for (let i = 0; i < 25 && !tTool; i++) { ws.send(JSON.stringify({ type: 'input.audio', audio: b64(silence) })); await new Promise((s) => setTimeout(s, 100)); }
    };

    ws.onopen = () => ws.send(JSON.stringify({ type: 'session.update', session: {
      system_prompt: SYSTEM, greeting: 'What are you signing?',
      input: { format: { encoding: 'audio/pcm' }, turn_detection: { min_silence: 400, max_silence: 1600 } },
      output: { voice: 'anna', format: { encoding: 'audio/pcm' } }, tools: TOOLS } }));

    ws.onmessage = async (e) => {
      const m = JSON.parse(e.data);
      if (m.type === 'session.error' || m.type === 'error') { r.error = m.message || JSON.stringify(m); clearTimeout(timer); done(); }
      if (m.type === 'reply.done' && !greeted) { greeted = true; streamAudio(); }
      if (m.type === 'transcript.user') r.heard = m.text;
      if (m.type === 'tool.call') { tTool = Date.now(); r.args = m.arguments; pendingCall = m.call_id; }
      if (m.type === 'reply.done' && greeted && pendingCall && !tResultSent) {
        tResultSent = Date.now();
        ws.send(JSON.stringify({ type: 'tool.result', call_id: pendingCall, result: JSON.stringify({ verdict: 'block', say: VERDICT }) }));
      }
      if (m.type === 'reply.audio' && tResultSent && !tFirstReply) tFirstReply = Date.now();
      if (m.type === 'transcript.agent' && tResultSent) {
        r.agentSaid = m.text;
        r.verbatim = m.text.trim().replace(/\s+/g, ' ') === VERDICT;
        r.msToTool = tTool && tAudioEnd ? tTool - tAudioEnd : null;
        r.msToVoice = tFirstReply && tResultSent ? tFirstReply - tResultSent : null;
        clearTimeout(timer); done();
      }
    };
    ws.onerror = () => { r.error = 'ws error'; clearTimeout(timer); done(); };
    // In hold mode the agent may not emit a reply.done before the tool call; answer the call directly.
    const poll = setInterval(() => {
      if (pendingCall && !tResultSent && Date.now() - tTool > 400) {
        tResultSent = Date.now();
        ws.send(JSON.stringify({ type: 'tool.result', call_id: pendingCall, result: JSON.stringify({ verdict: 'block', say: VERDICT }) }));
      }
      if (r.agentSaid || r.error) clearInterval(poll);
    }, 100);
  });
}

const norm = (v) => (typeof v === 'string' ? v.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim() : v);
function score(expect, args) {
  if (!args) return { ok: false, why: 'no tool call' };
  const bad = [];
  for (const [k, v] of Object.entries(expect)) {
    const got = args[k];
    if (typeof v === 'number') { if (Number(got) !== v) bad.push(`${k}: ${got} ≠ ${v}`); }
    else if (!norm(got)?.includes(norm(v)) && !(k === 'action' && norm(got) === norm(v))) bad.push(`${k}: ${got} ≠ ${v}`);
  }
  // hallucination: fields filled that were not in the expectation and not said
  for (const k of ['amount', 'token', 'token_out', 'recipient']) if (!(k in expect) && args[k] != null && args[k] !== '') bad.push(`invented ${k}: ${args[k]}`);
  return { ok: bad.length === 0, why: bad.join('; ') };
}

for (const u of U) { await runOne(u); const x = results.at(-1); Object.assign(x, score(u.expect, x.args)); console.log(`${x.id} ${x.ok ? 'OK  ' : 'MISS'} tool:${x.msToTool ?? '—'}ms voice:${x.msToVoice ?? '—'}ms verbatim:${x.verbatim ?? '—'} ${x.error ?? ''} ${x.ok ? '' : x.why}`); }
writeFileSync('results.json', JSON.stringify(results, null, 2));
const ok = results.filter((r) => r.ok).length, vb = results.filter((r) => r.verbatim).length;
const med = (a) => { const s = a.filter((x) => x != null).sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : null; };
console.log(`\nM5 intent accuracy: ${ok}/${results.length}`);
console.log(`M6 median end-of-speech → tool call: ${med(results.map((r) => r.msToTool))} ms; tool result → first verdict audio: ${med(results.map((r) => r.msToVoice))} ms`);
console.log(`M7 verdict spoken verbatim: ${vb}/${results.filter((r) => r.agentSaid).length}`);
