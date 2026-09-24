// Speech to a structured intent, through AssemblyAI's LLM Gateway with a strict
// JSON schema. This is the only place a language model is involved, and all it
// does is listen. Whether the transaction is safe is decided by lib/compare.js.
export const dynamic = 'force-dynamic';

const SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['swap', 'buy', 'sell', 'send', 'pay', 'deposit', 'approve', 'claim', 'mint', 'receive', 'login', 'verify', 'other'] },
    amount: { type: ['number', 'null'], description: 'The number the user said, as a plain number. "a hundred" is 100, "half" is 0.5. Null if none said.' },
    token: { type: ['string', 'null'], description: 'The asset being spent or sent, exactly as a ticker or name: "usdc", "eth". Null if none said.' },
    token_out: { type: ['string', 'null'], description: 'For swaps and buys, the asset the user wants to receive. Null otherwise.' },
    recipient: { type: ['string', 'null'], description: 'Who receives it, in the user\'s words or as a 0x address if they read one out. "me" if they said themselves. Null if not said.' },
    confirm: { type: 'boolean', description: 'True only if the user is plainly confirming or saying yes to go ahead, not describing a transaction.' },
  },
  required: ['action', 'amount', 'token', 'token_out', 'recipient', 'confirm'],
  additionalProperties: false,
};

const SYSTEM = `You extract what a crypto wallet user SAYS they are about to sign. You never judge safety and never guess what the transaction does; you only record the user's words faithfully. If they are vague, leave fields null rather than inventing them. "Claim my airdrop", "mint the free NFT" and "connect to the site" are claim, mint and login, never swap or approve.`;

export async function POST(req) {
  const { transcript } = await req.json();
  if (!transcript?.trim()) return Response.json({ error: 'empty transcript' }, { status: 400 });
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) return Response.json({ error: 'ASSEMBLYAI_API_KEY is not set' }, { status: 503 });

  const r = await fetch('https://llm-gateway.assemblyai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: key, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      temperature: 0,
      max_tokens: 300,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: transcript }],
      response_format: { type: 'json_schema', json_schema: { name: 'wallet_intent', schema: SCHEMA, strict: true } },
    }),
  });
  if (!r.ok) return Response.json({ error: `gateway ${r.status}: ${(await r.text()).slice(0, 300)}` }, { status: 502 });
  const j = await r.json();
  const text = j.choices?.find((c) => c.message?.content)?.message?.content ?? '';
  try {
    return Response.json({ intent: JSON.parse(text), model: j.request?.model ?? 'claude-sonnet-4-6' });
  } catch {
    return Response.json({ error: 'unparseable intent', raw: text.slice(0, 300) }, { status: 502 });
  }
}
