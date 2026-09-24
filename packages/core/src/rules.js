/**
 * Readback rules, v0.1.
 *
 * A verdict is the output of a fixed catalogue of rules. Each rule has a stable
 * ID, a level, and one sentence it may say. Nothing else produces a finding, and
 * no language model is consulted: the model's only job, upstream of this file, is
 * to turn speech into an Intent. Whether a transaction is safe is decided here,
 * by code a person can read.
 *
 * Levels:
 *   danger    blocks. Something is being taken, or control is being handed over.
 *   mismatch  blocks. The transaction is not what the signer said.
 *   warn      does not block. Said aloud before the signer confirms.
 */
import { formatUnits } from 'viem';
import { UNLIMITED } from './decode.js';
import { NATIVE, known, token, tokenBySpoken } from './tokens.js';

export const VERSION = 'readback/0.1';

const DAY = 86_400_000;
const lc = (a) => (typeof a === 'string' ? a.toLowerCase() : a);
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Screen text to spoken text. Nobody should hear "zero x three f nine b". */
export const forEar = (t) => t.replace(/,? ?0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4}/g, '').replace(/ ,/g, ',');

function num(v, decimals) {
  if (v === UNLIMITED) return 'unlimited';
  const n = Number(formatUnits(v, decimals));
  return n >= 1000 ? Math.round(n).toLocaleString('en-US') : String(Number(n.toPrecision(6)));
}
const sym = (a) => (a === 'native' ? NATIVE.symbol : token(a)?.symbol ?? `the token at ${short(a)}`);
const dec = (a) => (a === 'native' ? NATIVE.decimals : token(a)?.decimals ?? 18);

/** How an address is said out loud, and how far to trust it, from chain facts alone. */
export function describe(address, facts, sender) {
  if (!address) return { said: 'nobody', risk: 'none' };
  const a = lc(address);
  if (sender && a === lc(sender)) return { said: 'you', risk: 'none' };
  const label = known(a);
  if (label) return { said: label, risk: 'none' };
  const f = facts?.[a];
  if (!f) return { said: `an address I couldn't check, ${short(address)}`, risk: 'unknown' };
  if (!f.isContract) {
    return f.txCount === 0
      ? { said: `a wallet address with no history at all, ${short(address)}`, risk: 'high' }
      : { said: `a personal wallet, ${short(address)}`, risk: 'medium' };
  }
  const age = f.createdAt ? Date.now() - Date.parse(f.createdAt) : null;
  const ageSaid = age == null ? '' : age < DAY ? `deployed ${plural(Math.max(1, Math.round(age / 3_600_000)), 'hour')} ago` : `deployed ${plural(Math.round(age / DAY), 'day')} ago`;
  if (!f.verified) return { said: `an unverified contract${ageSaid ? `, ${ageSaid}` : ''}`, risk: 'high' };
  if (age != null && age < 7 * DAY) return { said: `a contract called ${f.name ?? 'unnamed'}, ${ageSaid}`, risk: 'high' };
  return { said: `a verified contract called ${f.name ?? 'unnamed'}`, risk: 'low' };
}

/** One action in plain words. */
export function sayAction(x, facts, sender) {
  const d = (a) => describe(a, facts, sender).said;
  switch (x.kind) {
    case 'native_transfer': return `send ${num(x.amount, 18)} ETH to ${d(x.to)}`;
    case 'transfer': return `send ${num(x.amount, dec(x.token))} ${sym(x.token)} to ${d(x.to)}`;
    case 'approve': return `let ${d(x.spender)} spend ${x.amount === UNLIMITED ? `unlimited ${sym(x.token)}, forever` : `${num(x.amount, dec(x.token))} of your ${sym(x.token)}`}`;
    case 'approval_for_all': return `give ${d(x.operator)} every item you own in that collection`;
    case 'swap': return `swap ${num(x.amountIn, dec(x.tokenIn))} ${sym(x.tokenIn)} for at least ${num(x.minOut, dec(x.tokenOut))} ${sym(x.tokenOut)} through ${d(x.via)}, paid to ${d(x.recipient)}`;
    case 'delegatecall': return `hand control of this Safe to ${d(x.target)}`;
    case 'approve_hash': return 'pre-approve a different Safe transaction that I cannot see';
    case 'gas_refund': return `pay a gas refund out of your Safe to ${d(x.refundReceiver)}`;
    case 'safe_admin': return ADMIN_SAID[x.op](x, d);
    default: return `call something I can't read on ${d(x.target)}`;
  }
}

/** Safe self-administration, said plainly. Each of these changes who controls the Safe. */
const ADMIN_SAID = {
  addOwnerWithThreshold: (x, d) => `add ${d(x.owner)} as an owner of your Safe, needing ${plural(x.threshold, 'signature')}`,
  removeOwner: (x, d) => `remove ${d(x.owner)} as an owner of your Safe, needing ${plural(x.threshold, 'signature')}`,
  swapOwner: (x, d) => `replace owner ${d(x.oldOwner)} with ${d(x.owner)}`,
  changeThreshold: (x) => `change your Safe to need ${plural(x.threshold, 'signature')}`,
  enableModule: (x, d) => `add ${d(x.module)} as a module, which can move everything in your Safe without any owner signing`,
  disableModule: (x, d) => `remove the module ${d(x.module)}`,
  setGuard: (x, d) => (/^0x0{40}$/i.test(x.guard) ? 'remove the guard protecting your Safe' : `set ${d(x.guard)} as your Safe's guard`),
  setFallbackHandler: (x, d) => `set ${d(x.handler)} as your Safe's fallback handler, which answers calls to your Safe on its behalf`,
};
/** Which spoken action each admin operation must have been. */
const ADMIN_INTENT = {
  addOwnerWithThreshold: 'add_owner', removeOwner: 'remove_owner', swapOwner: 'replace_owner', changeThreshold: 'change_threshold',
  enableModule: 'enable_module', disableModule: 'disable_module', setGuard: 'set_guard', setFallbackHandler: 'set_fallback_handler',
};
/** The admin operations that hand out control, as opposed to taking it back. */
const GRANTS = { enableModule: 'module', setGuard: 'guard', setFallbackHandler: 'handler', addOwnerWithThreshold: 'owner', swapOwner: 'owner' };

const TAKES = new Set(['claim', 'mint', 'receive', 'airdrop', 'login', 'sign_in', 'verify']);
const SWAPS = new Set(['swap', 'buy', 'sell', 'trade']);
const SENDS = new Set(['send', 'pay', 'transfer', 'deposit']);

function sameAmount(spoken, actual, decimals) {
  if (spoken == null) return true;
  if (actual === UNLIMITED) return false;
  const a = Number(formatUnits(actual, decimals));
  return Math.abs(a - spoken) <= Math.max(0.01 * spoken, 1e-9);
}
function tokenMatches(spoken, addr) {
  if (!spoken) return true;
  const t = tokenBySpoken(spoken);
  if (!t) return false;
  if (t.address === 'native') return addr === 'native' || lc(addr) === '0x4200000000000000000000000000000000000006';
  return t.address === lc(addr);
}

/**
 * The catalogue. Order matters only for which sentence is spoken first when a
 * transaction trips several rules: the first blocking finding is the one said.
 * `when` selects the actions a rule looks at; `check` returns the finding's
 * sentence, or nothing.
 */
export const RULES = [
  { id: 'RB-001', level: 'danger', name: 'unreadable', summary: 'Calldata that no decoder recognises is blocked.',
    when: (x) => x.kind === 'unknown',
    check: (x) => ({ text: "I can't read this transaction. Don't sign something nobody can read.", detail: `selector ${x.selector} on ${x.target}` }) },

  { id: 'RB-002', level: 'danger', name: 'safe-delegatecall', summary: "A Safe DELEGATECALL to anything but Safe's canonical MultiSend contracts is blocked, whatever was said. MultiSend batches are unpacked and each leg judged.",
    when: (x) => x.kind === 'delegatecall',
    check: (x, c) => ({ text: `This doesn't send anything. It hands control of your Safe to ${c.d(x.target)}. That is how Bybit lost one and a half billion dollars.`,
      detail: "Safe operation 1. The target's code runs with the Safe's own storage and authority." }) },

  { id: 'RB-003', level: 'danger', name: 'approval-for-all', summary: 'setApprovalForAll(true) is blocked unless the signer said approve.',
    when: (x) => x.kind === 'approval_for_all' && x.approved,
    check: (x, c) => (c.act === 'approve' ? null : { text: `This would ${c.say(x)}.`, detail: 'The operator can move every item in the collection, now and later.' }) },

  { id: 'RB-004', level: 'danger', name: 'approve-on-claim', summary: 'An approval, when the signer said claim, mint, receive or log in, is blocked.',
    when: (x) => x.kind === 'approve',
    check: (x, c) => (TAKES.has(c.act) ? { text: `A ${c.act} should give you something. This lets ${c.d(x.spender)} take your ${sym(x.token)}${x.amount === UNLIMITED ? ', all of it, forever' : ''}.` } : null) },

  { id: 'RB-005', level: 'danger', name: 'approve-risky-spender', summary: 'An approval to an unverified, freshly deployed or history-less address is blocked.',
    when: (x) => x.kind === 'approve',
    check: (x, c) => (!TAKES.has(c.act) && c.risk(x.spender) === 'high' ? { text: `This would ${c.say(x)}.` } : null) },

  { id: 'RB-006', level: 'mismatch', name: 'approve-amount', summary: 'An approval for a different amount than the signer said is blocked.',
    when: (x) => x.kind === 'approve',
    check: (x, c) => (c.act === 'approve' && x.amount !== UNLIMITED && !sameAmount(c.intent.amount, x.amount, dec(x.token)) ? { text: `You said ${c.intent.amount}, but this approves ${num(x.amount, dec(x.token))} ${sym(x.token)}.` } : null) },

  { id: 'RB-007', level: 'warn', name: 'approve-unlimited', summary: 'An unlimited approval to a trusted spender is allowed, and said aloud.',
    when: (x) => x.kind === 'approve' && x.amount === UNLIMITED,
    check: (x, c) => (!TAKES.has(c.act) && c.risk(x.spender) !== 'high' ? { text: `It also lets ${c.d(x.spender)} spend unlimited ${sym(x.token)}. An exact amount would be safer.` } : null) },

  { id: 'RB-008', level: 'danger', name: 'approve-hash', summary: 'approveHash pre-approves another Safe transaction whose contents are not in this one. Always blocked.',
    when: (x) => x.kind === 'approve_hash',
    check: () => ({ text: "This doesn't do anything itself. It pre-approves a different Safe transaction that I can't see.", detail: 'Safe approveHash(bytes32). The approved transaction can be executed later by anyone holding it.' }) },

  { id: 'RB-009', level: 'danger', name: 'gas-refund', summary: 'A Safe gas refund paid to anyone but the signer is blocked.',
    when: (x) => x.kind === 'gas_refund',
    check: (x, c) => (c.sender && lc(x.refundReceiver) === lc(c.sender) ? null : { text: `It also pays a gas refund out of your Safe to ${c.d(x.refundReceiver)}.`, detail: `gasPrice ${x.gasPrice}, gasToken ${x.gasToken}. Refunds are paid from the Safe's own balance.` }) },

  { id: 'RB-030', level: 'danger', name: 'safe-admin-not-said', summary: 'A change to owners, threshold, modules, guard or fallback handler is blocked unless the signer said that change.',
    when: (x) => x.kind === 'safe_admin',
    check: (x, c) => (c.act === ADMIN_INTENT[x.op] ? null : { text: `This would ${c.say(x)}.` }) },

  { id: 'RB-031', level: 'danger', name: 'safe-admin-risky-grant', summary: 'Granting module, guard, handler or ownership to an unverified, freshly deployed or history-less address is blocked, even if said.',
    when: (x) => x.kind === 'safe_admin' && GRANTS[x.op],
    check: (x, c) => (c.act === ADMIN_INTENT[x.op] && c.risk(x[GRANTS[x.op]]) === 'high' && GRANTS[x.op] !== 'owner' ? { text: `This would ${c.say(x)}. That address is ${c.d(x[GRANTS[x.op]])}.` } : null) },

  { id: 'RB-032', level: 'danger', name: 'safe-admin-wrong-address', summary: 'An owner or module address different from the one read out is blocked.',
    when: (x) => x.kind === 'safe_admin' && GRANTS[x.op],
    check: (x, c) => (/^0x[0-9a-f]{40}$/i.test(c.intent.recipient ?? '') && lc(c.intent.recipient) !== lc(x[GRANTS[x.op]]) ? { text: `That's not the address you said. This uses ${short(x[GRANTS[x.op]])}.` } : null) },

  { id: 'RB-033', level: 'warn', name: 'safe-admin-named', summary: 'An owner or module given by name cannot be verified; its last four characters are read out.',
    when: (x) => x.kind === 'safe_admin' && GRANTS[x.op],
    check: (x, c) => (c.act === ADMIN_INTENT[x.op] && c.intent.recipient && !/^0x/i.test(c.intent.recipient)
      ? { text: `I can't know which address is "${c.intent.recipient}". This uses an address ending in ${x[GRANTS[x.op]].slice(-4).toUpperCase().split('').join(' ')}. Check those last four.` } : null) },

  { id: 'RB-010', level: 'mismatch', name: 'swap-not-said', summary: 'A swap, when the signer did not say swap, buy, sell or trade, is blocked.',
    when: (x) => x.kind === 'swap',
    check: (x, c) => (SWAPS.has(c.act) ? null : { text: `You said ${c.act}, but this is a swap: it would ${c.say(x)}.` }) },

  { id: 'RB-011', level: 'mismatch', name: 'swap-asset-in', summary: 'A swap spending a different asset than the one said is blocked.',
    when: (x) => x.kind === 'swap',
    check: (x, c) => (tokenMatches(c.intent.token, x.tokenIn) ? null : { text: `You said you're paying with ${c.intent.token}, but this spends ${sym(x.tokenIn)}.` }) },

  { id: 'RB-012', level: 'mismatch', name: 'swap-asset-out', summary: 'A swap buying a different asset than the one said is blocked.',
    when: (x) => x.kind === 'swap',
    check: (x, c) => (tokenMatches(c.intent.token_out, x.tokenOut) ? null : { text: `You said you wanted ${c.intent.token_out}, but this buys ${sym(x.tokenOut)}.` }) },

  { id: 'RB-013', level: 'mismatch', name: 'swap-amount', summary: 'A swap spending a different amount than the one said is blocked. Tolerance 1%.',
    when: (x) => x.kind === 'swap',
    check: (x, c) => (sameAmount(c.intent.amount, x.amountIn, dec(x.tokenIn)) ? null : { text: `You said ${c.intent.amount}, but this spends ${num(x.amountIn, dec(x.tokenIn))} ${sym(x.tokenIn)}.` }) },

  { id: 'RB-014', level: 'danger', name: 'swap-recipient', summary: 'A swap whose output is paid to anyone but the signer is blocked.',
    when: (x) => x.kind === 'swap',
    check: (x, c) => (c.sender && lc(x.recipient) !== lc(c.sender) && lc(x.recipient) !== lc(x.via) ? { text: `The ${sym(x.tokenOut)} doesn't come back to you. It goes to ${c.d(x.recipient)}.` } : null) },

  { id: 'RB-015', level: 'danger', name: 'swap-venue', summary: 'A swap routed through an unverified or freshly deployed contract is blocked.',
    when: (x) => x.kind === 'swap',
    check: (x, c) => (c.risk(x.via) === 'high' ? { text: `The swap runs through ${c.d(x.via)}.` } : null) },

  { id: 'RB-016', level: 'warn', name: 'swap-no-slippage', summary: 'A swap with a zero minimum output is allowed, and said aloud.',
    when: (x) => x.kind === 'swap' && x.minOut === 0n,
    check: () => ({ text: 'It has no slippage protection. You could get almost nothing back.' }) },

  { id: 'RB-020', level: 'danger', name: 'send-on-claim', summary: 'A transfer out, when the signer said claim, mint, receive or log in, is blocked.',
    when: (x) => x.kind === 'transfer' || x.kind === 'native_transfer',
    check: (x, c) => (TAKES.has(c.act) ? { text: `A ${c.act} should give you something. This sends your ${sym(c.asset(x))} away, to ${c.d(x.to)}.` } : null) },

  { id: 'RB-021', level: 'mismatch', name: 'send-not-said', summary: 'A transfer, when the signer did not say send, pay, transfer or deposit, is blocked.',
    when: (x) => x.kind === 'transfer' || x.kind === 'native_transfer',
    check: (x, c) => (TAKES.has(c.act) || SENDS.has(c.act) ? null : { text: `You said ${c.act}, but this would ${c.say(x)}.` }) },

  { id: 'RB-022', level: 'mismatch', name: 'send-amount', summary: 'A transfer of a different amount than the one said is blocked. Tolerance 1%.',
    when: (x) => x.kind === 'transfer' || x.kind === 'native_transfer',
    check: (x, c) => (TAKES.has(c.act) || sameAmount(c.intent.amount, x.amount, dec(c.asset(x))) ? null : { text: `You said ${c.intent.amount}, but this sends ${num(x.amount, dec(c.asset(x)))} ${sym(c.asset(x))}.` }) },

  { id: 'RB-023', level: 'mismatch', name: 'send-asset', summary: 'A transfer of a different asset than the one said is blocked.',
    when: (x) => x.kind === 'transfer' || x.kind === 'native_transfer',
    check: (x, c) => (TAKES.has(c.act) || tokenMatches(c.intent.token, c.asset(x)) ? null : { text: `You said ${c.intent.token}, but this sends ${sym(c.asset(x))}.` }) },

  { id: 'RB-024', level: 'danger', name: 'send-wrong-address', summary: 'A transfer to a different address than the one read out is blocked.',
    when: (x) => x.kind === 'transfer' || x.kind === 'native_transfer',
    check: (x, c) => (/^0x[0-9a-f]{40}$/i.test(c.intent.recipient ?? '') && lc(c.intent.recipient) !== lc(x.to) ? { text: `That's not the address you said. This goes to ${short(x.to)}.` } : null) },

  { id: 'RB-025', level: 'warn', name: 'send-named-recipient', summary: 'A recipient given by name cannot be verified; its last four characters are read out.',
    when: (x) => x.kind === 'transfer' || x.kind === 'native_transfer',
    check: (x, c) => (c.intent.recipient && !/^0x/i.test(c.intent.recipient) && !/^(me|myself)$/i.test(c.intent.recipient) && !TAKES.has(c.act)
      ? { text: `I can't know which address is "${c.intent.recipient}". This goes to an address ending in ${x.to.slice(-4).toUpperCase().split('').join(' ')}. Check those last four.` } : null) },

  { id: 'RB-026', level: 'warn', name: 'send-risky-recipient', summary: 'A transfer to a history-less or unverified address is allowed, and said aloud.',
    when: (x) => x.kind === 'transfer' || x.kind === 'native_transfer',
    check: (x, c) => (!TAKES.has(c.act) && c.risk(x.to) === 'high' ? { text: `The recipient is ${c.d(x.to)}.` } : null) },
];

const plain = (v) => (typeof v === 'bigint' ? v.toString() : v);

/**
 * Evaluate a decoded transaction against what the signer said.
 *
 * @param {object} intent   A Readback intent (schema/intent.json)
 * @param {object[]} actions From decodeTx
 * @param {object} facts    lowercase address → { isContract, verified, name, createdAt, txCount }
 * @param {string} sender   The signing address
 * @returns {Verdict}
 */
export function evaluate(intent, actions, facts, sender) {
  const i = intent ?? { action: 'other' };
  const c = {
    intent: i, act: i.action ?? 'other', sender, facts,
    d: (a) => describe(a, facts, sender).said,
    risk: (a) => describe(a, facts, sender).risk,
    say: (x) => sayAction(x, facts, sender),
    asset: (x) => (x.kind === 'native_transfer' ? 'native' : x.token),
  };

  const findings = [];
  if (!actions.length) findings.push({ rule: 'RB-000', level: 'mismatch', text: "This transaction doesn't do anything I can see." });
  for (const x of actions) {
    for (const r of RULES) {
      if (!r.when(x)) continue;
      const hit = r.check(x, c);
      if (hit) findings.push({ rule: r.id, level: r.level, ...hit });
    }
  }

  const blocking = findings.filter((f) => f.level !== 'warn');
  const verdict = blocking.length ? 'block' : 'match';
  const warn = findings.find((f) => f.level === 'warn');
  const does = actions.filter((x) => x.kind !== 'unknown').map((x) => c.say(x));
  const spoken = forEar(verdict === 'block'
    ? `Stop. ${blocking[0].text}`
    : `That matches. It will ${does.join(', then ')}.${warn ? ` ${warn.text}` : ''} Say confirm to sign.`);

  return {
    version: VERSION,
    verdict,
    findings,
    spoken,
    actions: actions.map((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, plain(v)]))),
    intent: i,
  };
}

/** Backwards-compatible name used by the first version of the app. */
export const readback = evaluate;
