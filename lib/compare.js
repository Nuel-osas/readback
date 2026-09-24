/**
 * The readback itself: what you said, against what the transaction does.
 *
 * Deterministic on purpose. The language model's only job is to turn speech into
 * a small structured intent; it never decides whether something is safe. Every
 * block below is a rule a person can read, and every sentence the agent speaks
 * comes from one of them.
 */
import { formatUnits } from 'viem';
import { UNLIMITED } from './decode.js';
import { NATIVE, known, token, tokenBySpoken } from './tokens.js';

const DAY = 86_400_000;
const lc = (a) => (a ? a.toLowerCase() : a);
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
/** Screen text to spoken text: nobody should hear "zero x three f nine b" read out. */
export const forEar = (t) => t.replace(/,? ?0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4}/g, '').replace(/ ,/g, ',');

function num(v, decimals) {
  if (v === UNLIMITED) return 'unlimited';
  const n = Number(formatUnits(v, decimals));
  return n >= 1000 ? Math.round(n).toLocaleString('en-US') : String(Number(n.toPrecision(6)));
}
const sym = (addr) => (addr === 'native' ? NATIVE.symbol : token(addr)?.symbol ?? `the token at ${short(addr)}`);
const dec = (addr) => (addr === 'native' ? NATIVE.decimals : token(addr)?.decimals ?? 18);

/** How an address should be said out loud, and how much to trust it. */
export function describe(address, facts, sender) {
  if (!address) return { said: 'nobody', risk: 'none' };
  const a = lc(address);
  if (sender && a === lc(sender)) return { said: 'you', risk: 'none' };
  const label = known(a);
  const f = facts?.[a];
  if (label) return { said: label, risk: 'none' };
  if (!f) return { said: `an address I couldn't check, ${short(address)}`, risk: 'unknown' };
  if (!f.isContract) {
    return f.txCount === 0
      ? { said: `a wallet address with no history at all, ${short(address)}`, risk: 'high' }
      : { said: `a personal wallet, ${short(address)}`, risk: 'medium' };
  }
  const age = f.createdAt ? Date.now() - Date.parse(f.createdAt) : null;
  const fresh = age != null && age < 7 * DAY;
  const ageSaid = age == null ? '' : age < DAY ? `deployed ${plural(Math.max(1, Math.round(age / 3_600_000)), 'hour')} ago` : `deployed ${plural(Math.round(age / DAY), 'day')} ago`;
  if (!f.verified) return { said: `an unverified contract${ageSaid ? `, ${ageSaid}` : ''}`, risk: 'high' };
  if (fresh) return { said: `a contract called ${f.name ?? 'unnamed'}, ${ageSaid}`, risk: 'high' };
  return { said: `a verified contract called ${f.name ?? 'unnamed'}`, risk: 'low' };
}

/** One action, said plainly. */
export function sayAction(x, facts, sender) {
  const d = (a) => describe(a, facts, sender).said;
  switch (x.kind) {
    case 'native_transfer': return `send ${num(x.amount, 18)} ETH to ${d(x.to)}`;
    case 'transfer': return `send ${num(x.amount, dec(x.token))} ${sym(x.token)} to ${d(x.to)}`;
    case 'approve': return `let ${d(x.spender)} spend ${x.amount === UNLIMITED ? `unlimited ${sym(x.token)}, forever` : `${num(x.amount, dec(x.token))} of your ${sym(x.token)}`}`;
    case 'approval_for_all': return `give ${d(x.operator)} every item you own in that collection`;
    case 'swap': return `swap ${num(x.amountIn, dec(x.tokenIn))} ${sym(x.tokenIn)} for at least ${num(x.minOut, dec(x.tokenOut))} ${sym(x.tokenOut)} through ${d(x.via)}, paid to ${d(x.recipient)}`;
    case 'delegatecall': return `hand control of this Safe to ${d(x.target)}`;
    default: return `call something I can't read on ${d(x.target)}`;
  }
}

const TAKES = new Set(['claim', 'mint', 'receive', 'airdrop', 'login', 'sign_in', 'verify']);
const sameAmount = (spoken, actual, decimals) => {
  if (spoken == null || actual === UNLIMITED) return spoken == null;
  const a = Number(formatUnits(actual, decimals));
  return Math.abs(a - spoken) <= Math.max(0.01 * spoken, 1e-9);
};
const tokenMatches = (spoken, addr) => {
  if (!spoken) return true;
  const t = tokenBySpoken(spoken);
  if (!t) return false;
  if (t.address === 'native') return lc(addr) === '0x4200000000000000000000000000000000000006' || addr === 'native';
  return t.address === lc(addr);
};

/**
 * @param {object} intent  { action, amount, token, token_out, recipient } from speech
 * @param {object[]} actions from decodeTx
 * @param {object} facts   lowercase address to { isContract, verified, name, createdAt, txCount }
 * @param {string} sender  the signing address
 * @returns {{ verdict: 'match'|'block', findings: object[], spoken: string }}
 */
export function readback(intent, actions, facts, sender) {
  const F = [];
  const add = (level, text, detail) => F.push({ level, text, detail });
  const act = intent?.action ?? 'other';

  if (!actions.length) add('mismatch', "This transaction doesn't do anything I can see.");

  for (const x of actions) {
    const said = sayAction(x, facts, sender);

    if (x.kind === 'unknown') {
      add('danger', `I can't read this transaction. Don't sign something nobody can read.`, `selector ${x.selector} on ${x.target}`);
      continue;
    }

    if (x.kind === 'delegatecall') {
      add('danger', `This doesn't send anything. It hands control of your Safe to ${describe(x.target, facts, sender).said}. That is how Bybit lost one and a half billion dollars.`,
        'Safe operation 1, DELEGATECALL. The target runs with the Safe\'s own storage and authority. This is the shape of the Bybit attack of February 2025.');
      continue;
    }

    if (x.kind === 'approval_for_all' && x.approved) {
      add(act === 'approve' ? 'warn' : 'danger', `This would ${said}.`, 'setApprovalForAll lets the operator move every NFT you hold in the collection, now and later.');
      continue;
    }

    if (x.kind === 'approve') {
      const who = describe(x.spender, facts, sender);
      if (TAKES.has(act)) {
        add('danger', `A ${act} should give you something. This lets ${who.said} take your ${sym(x.token)}${x.amount === UNLIMITED ? ', all of it, forever' : ''}.`);
      } else if (who.risk === 'high') {
        add('danger', `This would ${said}.`, 'Approval to an unverified, brand new, or history-less address.');
      } else if (x.amount === UNLIMITED) {
        add('warn', `It also lets ${who.said} spend unlimited ${sym(x.token)}. An exact amount would be safer.`);
      } else if (act === 'approve' && !sameAmount(intent.amount, x.amount, dec(x.token))) {
        add('mismatch', `You said ${intent.amount}, but this approves ${num(x.amount, dec(x.token))} ${sym(x.token)}.`);
      }
      continue;
    }

    if (x.kind === 'swap') {
      if (!['swap', 'buy', 'sell', 'trade'].includes(act)) add('mismatch', `You said ${act}, but this is a swap: it would ${said}.`);
      if (!tokenMatches(intent?.token, x.tokenIn)) add('mismatch', `You said you're paying with ${intent.token}, but this spends ${sym(x.tokenIn)}.`);
      if (!tokenMatches(intent?.token_out, x.tokenOut)) add('mismatch', `You said you wanted ${intent.token_out}, but this buys ${sym(x.tokenOut)}.`);
      if (intent?.amount != null && !sameAmount(intent.amount, x.amountIn, dec(x.tokenIn))) add('mismatch', `You said ${intent.amount}, but this spends ${num(x.amountIn, dec(x.tokenIn))} ${sym(x.tokenIn)}.`);
      if (sender && lc(x.recipient) !== lc(sender) && lc(x.recipient) !== lc(x.via)) add('danger', `The ${sym(x.tokenOut)} doesn't come back to you. It goes to ${describe(x.recipient, facts, sender).said}.`);
      if (describe(x.via, facts, sender).risk === 'high') add('danger', `The swap runs through ${describe(x.via, facts, sender).said}.`);
      if (x.minOut === 0n) add('warn', 'It has no slippage protection. You could get almost nothing back.');
      continue;
    }

    if (x.kind === 'transfer' || x.kind === 'native_transfer') {
      const tokenAddr = x.kind === 'native_transfer' ? 'native' : x.token;
      const to = describe(x.to, facts, sender);
      if (TAKES.has(act)) {
        add('danger', `A ${act} should give you something. This sends your ${sym(tokenAddr)} away, to ${to.said}.`);
        continue;
      }
      if (!['send', 'pay', 'transfer', 'deposit'].includes(act)) add('mismatch', `You said ${act}, but this would ${said}.`);
      if (intent?.amount != null && !sameAmount(intent.amount, x.amount, dec(tokenAddr))) add('mismatch', `You said ${intent.amount}, but this sends ${num(x.amount, dec(tokenAddr))} ${sym(tokenAddr)}.`);
      if (!tokenMatches(intent?.token, tokenAddr)) add('mismatch', `You said ${intent.token}, but this sends ${sym(tokenAddr)}.`);
      const r = intent?.recipient;
      if (r && /^0x[0-9a-f]{40}$/i.test(r) && lc(r) !== lc(x.to)) add('danger', `That's not the address you said. This goes to ${short(x.to)}.`);
      else if (r && !/^0x/i.test(r)) add('warn', `I can't know which address is "${r}". This goes to an address ending in ${x.to.slice(-4).toUpperCase().split('').join(' ')}. Check those last four.`);
      if (to.risk === 'high') add('warn', `The recipient is ${to.said}.`);
    }
  }

  const blocking = F.filter((f) => f.level === 'danger' || f.level === 'mismatch');
  const verdict = blocking.length ? 'block' : 'match';
  const main = actions.filter((x) => x.kind !== 'unknown').map((x) => sayAction(x, facts, sender));
  const spoken = forEar(verdict === 'block'
    ? `Stop. ${blocking[0].text}`
    : `That matches. It will ${main.join(', then ')}.${F.find((f) => f.level === 'warn') ? ` ${F.find((f) => f.level === 'warn').text}` : ''} Say confirm to sign.`);
  return { verdict, findings: F, spoken };
}
