// End-to-end evidence on Base Sepolia, through the real notary API and the deployed guard.
//
//   1. Two identical 2-of-2 Safes. One gets ReadbackGuard, one is the control.
//   2. An honest transfer: the notary attests, the guarded Safe executes.
//   3. A Bybit-shaped DELEGATECALL, signed by both owners, as at Bybit.
//      Guarded: the notary refuses, the chain refuses, mined as a revert.
//      Control: the Safe's implementation at slot 0 is replaced.
//
//   node --env-file=.env scripts/evidence.mjs   (needs the web app running on NOTARY_URL)
import { writeFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, encodeFunctionData, http, parseAbi, parseEther, getAddress, concatHex, keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

const NOTARY = process.env.NOTARY_URL ?? 'http://127.0.0.1:4311/api/readback';
const GUARD = '0xAA3356D3E0237898a3A613E111625043A1614355';
const BYBIT_SHAPE = '0x60b70BC2E774d7A781138009A28B2917893dc98A';
const SINGLETON = '0x29fcB43b46531BcA003ddC8FCB67FFE91900C762'; // SafeL2 1.4.1
const FACTORY = '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67';
const ZERO = '0x0000000000000000000000000000000000000000';
const EXPLORER = 'https://sepolia.basescan.org/tx/';

const o1 = privateKeyToAccount(process.env.DEPLOYER_KEY);
const o2 = privateKeyToAccount(process.env.OWNER2_KEY);
const pub = createPublicClient({ chain: baseSepolia, transport: http('https://sepolia.base.org') });
const w = createWalletClient({ account: o1, chain: baseSepolia, transport: http('https://sepolia.base.org') });

const SAFE = parseAbi([
  'function setup(address[] owners, uint256 threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)',
  'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool)',
  'function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 nonce) view returns (bytes32)',
  'function nonce() view returns (uint256)',
  'function setGuard(address guard)',
  'function getOwners() view returns (address[])',
]);
const FACT = parseAbi(['function createProxyWithNonce(address singleton, bytes initializer, uint256 saltNonce) returns (address proxy)', 'event ProxyCreation(address indexed proxy, address singleton)']);
const GUARD_ABI = parseAbi(['function setNotary(address notary)', 'function notaryOf(address) view returns (address)']);
/** Retry a read pinned to a block until the node serving it has caught up. */
async function at(fn, tries = 20) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= tries || !/block not found|not found/i.test(String(e))) throw e; await new Promise((r) => setTimeout(r, 750)); }
  }
}
const log = [];
const note = (k, v) => { log.push([k, v]); console.log(k.padEnd(34), v); };
// sepolia.base.org is load-balanced: a read straight after a write can hit a node that
// has not seen the block yet. So nonces are tracked locally and every receipt is checked.
const nonces = new Map();
const wait = async (hash, expectRevert = false) => {
  const rc = await pub.waitForTransactionReceipt({ hash });
  if (!expectRevert && rc.status !== 'success') throw new Error(`tx reverted: ${hash}`);
  return rc;
};

async function newSafe(salt) {
  const init = encodeFunctionData({ abi: SAFE, functionName: 'setup', args: [[o1.address, o2.address], 2n, ZERO, '0x', ZERO, ZERO, 0n, ZERO] });
  const h = await w.writeContract({ address: FACTORY, abi: FACT, functionName: 'createProxyWithNonce', args: [SINGLETON, init, salt] });
  const rc = await wait(h);
  const ev = rc.logs.find((l) => l.address.toLowerCase() === FACTORY.toLowerCase());
  return getAddress(`0x${ev.topics[1].slice(26)}`);
}

async function ownerSigs(safe, tx) {
  const nonce = nonces.get(safe) ?? 0n;
  const hash = await pub.readContract({ address: safe, abi: SAFE, functionName: 'getTransactionHash', args: [tx.to, tx.value, tx.data, tx.operation, 0n, 0n, 0n, ZERO, ZERO, nonce] });
  const signers = [o1, o2].sort((a, b) => (BigInt(a.address) < BigInt(b.address) ? -1 : 1));
  return { hash, sigs: concatHex(await Promise.all(signers.map((s) => s.sign({ hash })))) };
}

async function exec(safe, tx, tail = '0x', gas) {
  const { sigs } = await ownerSigs(safe, tx);
  // A reverted execTransaction does not consume the nonce, so only count successes (see run()).
  return w.writeContract({ address: safe, abi: SAFE, functionName: 'execTransaction', args: [tx.to, tx.value, tx.data, tx.operation, 0n, 0n, 0n, ZERO, ZERO, concatHex([sigs, tail])], ...(gas ? { gas } : {}) });
}

async function run(safe, tx, tail, gas, expectRevert = false) {
  const h = await exec(safe, tx, tail, gas);
  const rc = await wait(h, expectRevert);
  if (rc.status === 'success') nonces.set(safe, (nonces.get(safe) ?? 0n) + 1n);
  return { h, rc };
}

async function notary(safe, tx, intent) {
  const r = await fetch(NOTARY, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chainId: 84532, safe, sender: o1.address, intent, tx: { ...tx, value: tx.value.toString(), nonce: (nonces.get(safe) ?? 0n).toString() } }) });
  return r.json();
}

// ---------------------------------------------------------------- setup
const salt = BigInt(keccak256(toHex(`readback-evidence-${Date.now()}`)));
const guarded = await newSafe(salt);
const control = await newSafe(salt + 1n);
note('guarded Safe', guarded);
note('control Safe (no guard)', control);

for (const s of [guarded, control]) await wait(await w.sendTransaction({ to: s, value: parseEther('0.0005') }));
const { rc: rn } = await run(guarded, { to: GUARD, value: 0n, data: encodeFunctionData({ abi: GUARD_ABI, functionName: 'setNotary', args: [process.env.NOTARY_ADDRESS] }), operation: 0 });
note('notary on guard', await at(() => pub.readContract({ address: GUARD, abi: GUARD_ABI, functionName: 'notaryOf', args: [guarded], blockNumber: rn.blockNumber })));
await run(guarded, { to: guarded, value: 0n, data: encodeFunctionData({ abi: SAFE, functionName: 'setGuard', args: [GUARD] }), operation: 0 });
note('guard installed', 'yes');

// ---------------------------------------------------------------- 1. honest transfer, attested
const recipient = privateKeyToAccount(keccak256(toHex('readback-recipient'))).address;
const honest = { to: recipient, value: parseEther('0.0001'), data: '0x', operation: 0 };
const v1 = await notary(guarded, honest, { action: 'send', amount: 0.0001, token: 'eth', token_out: null, recipient, confirm: false });
note('notary verdict (honest)', `${v1.verdict} | ${v1.spoken}`);
if (!v1.attestation) throw new Error(`expected an attestation: ${JSON.stringify(v1).slice(0, 300)}`);
const { h: hHonest, rc: rHonest } = await run(guarded, honest, v1.attestation.bytes);
note('honest transfer, guarded Safe', `${rHonest.status} ${EXPLORER}${hHonest}`);

// ---------------------------------------------------------------- 2. the Bybit shape
const attack = { to: BYBIT_SHAPE, value: 0n, data: encodeFunctionData({ abi: parseAbi(['function transfer(address,uint256)']), functionName: 'transfer', args: [BYBIT_SHAPE, 0n] }), operation: 1 };
const v2 = await notary(guarded, attack, { action: 'send', amount: 1, token: 'eth', token_out: null, recipient: 'my cold wallet', confirm: false });
note('notary verdict (Bybit shape)', `${v2.verdict} | ${v2.spoken} | attestation: ${v2.attestation ? 'YES (bad)' : 'none'}`);

const { h: hG, rc: rG } = await run(guarded, attack, '0x', 400000n, true);
note('Bybit shape, guarded Safe', `${rG.status} ${EXPLORER}${hG}`);
const slotG = await at(() => pub.getStorageAt({ address: guarded, slot: '0x0', blockNumber: rG.blockNumber }));
note('guarded implementation after', getAddress(`0x${slotG.slice(26)}`));

const { h: hC, rc: rC } = await run(control, attack, '0x', 400000n, true);
note('Bybit shape, control Safe', `${rC.status} ${EXPLORER}${hC}`);
const slotC = await at(() => pub.getStorageAt({ address: control, slot: '0x0', blockNumber: rC.blockNumber }));
note('control implementation after', getAddress(`0x${slotC.slice(26)}`));

writeFileSync('evidence/base-sepolia.json', JSON.stringify(Object.fromEntries(log), null, 2));
console.log('\nwrote evidence/base-sepolia.json');
