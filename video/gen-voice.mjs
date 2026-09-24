// Narration for the Readback film. Brian, instructional read. No em dashes; numbers spelled out.
import { writeFile, mkdir, readFile } from 'node:fs/promises';
const KEY = (await readFile('/Users/emmanuelosadebe/Downloads/projects/hackies/api.md', 'utf8')).trim();
const BRIAN = 'nPczCjzI2devNBz1zQrb';
const LINES = [
  ['n1', 'In February twenty twenty-five, Bybit lost one and a half billion dollars to a single transaction.'],
  ['n2', 'Every signer checked it. Their screens showed a routine transfer. Their wallets signed something else: a delegate call that handed the whole Safe to an attacker.'],
  ['n3', 'Pilots solved this decades ago. Every instruction from the tower is read back out loud, and the controller listens for the mismatch.'],
  ['n4', "Readback brings that loop to signing. You say what you think you're signing. It decodes what the transaction really does, and tells you if they don't match."],
  ['n5', 'A site offers a free airdrop.'],
  ['n6', 'Now the Bybit attack itself, against a real Safe on Base.'],
  ['n7', 'Same transaction, signed by both owners. On a Safe with the Readback guard, it reverts on chain. On a Safe without it, the attacker takes control.'],
  ['n8', 'And when you are right, it gets out of your way.'],
  ['n9', "The AssemblyAI voice agent only listens. It never sees the transaction, so it can't be talked into agreeing with it. Twenty-seven plain rules decide. A Safe guard enforces the result on chain."],
  ['n10', 'Fifteen out of fifteen intents understood. Every verdict spoken word for word. About two seconds from your last word to the answer.'],
  ['n11', "Readback. Say what you think you're signing."],
];
const VOICE = { stability: 0.46, similarity_boost: 0.78, style: 0.38, use_speaker_boost: true };
const post = async (url, body) => { const r = await fetch(url, { method: 'POST', headers: { 'xi-api-key': KEY, 'content-type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); return Buffer.from(await r.arrayBuffer()); };
await mkdir('public/vo', { recursive: true });
const mode = process.argv[2] ?? 'all';
if (mode !== 'music') for (const [id, text] of LINES) {
  if (/[—–]/.test(text)) throw new Error(`${id} has a dash`);
  await writeFile(`public/vo/${id}.mp3`, await post(`https://api.elevenlabs.io/v1/text-to-speech/${BRIAN}`, { text, model_id: 'eleven_multilingual_v2', voice_settings: VOICE }));
  process.stdout.write(`${id} `);
}
if (mode !== 'vo') { await writeFile('public/bed.mp3', await post('https://api.elevenlabs.io/v1/music', { prompt: 'Low, tense, minimal electronic score for a cybersecurity product film. Deep sustained synth pads, a slow heartbeat pulse, subtle cockpit-instrument textures. No vocals, no drops, no big builds. Sits under a spoken voiceover.', music_length_ms: 180000 })); console.log('\nbed ok'); }
