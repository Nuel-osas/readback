// Takes the attestation a spoken readback produced in the browser and executes the Safe
// transaction with it on Base Sepolia. Owners sign the same Safe tx hash the notary attested.
import { readFileSync, writeFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, http, parseAbi, parseEther, concatHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
const v = JSON.parse(readFileSync(process.argv[2]));
const SAFE = '0x48aB94CfED0045456DfcD750Bf419199a5fa11d5', COLD = '0x7adcCAD209A23b730Ea3E637A1Eb09b51CbD2170', ZERO = '0x0000000000000000000000000000000000000000';
const abi = parseAbi(['function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) returns (bool)', 'function getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256) view returns (bytes32)', 'function nonce() view returns (uint256)']);
const o1 = privateKeyToAccount(process.env.DEPLOYER_KEY), o2 = privateKeyToAccount(process.env.OWNER2_KEY);
const pub = createPublicClient({ chain: baseSepolia, transport: http('https://sepolia.base.org') });
const w = createWalletClient({ account: o1, chain: baseSepolia, transport: http('https://sepolia.base.org') });
const tx = [COLD, parseEther('0.0001'), '0x', 0, 0n, 0n, 0n, ZERO, ZERO];
const nonce = await pub.readContract({ address: SAFE, abi, functionName: 'nonce' });
const hash = await pub.readContract({ address: SAFE, abi, functionName: 'getTransactionHash', args: [...tx, nonce] });
if (hash.toLowerCase() !== v.attestation.toLowerCase()) throw new Error(`notary attested ${v.attestation}, chain says ${hash}`);
const sigs = concatHex(await Promise.all([o1, o2].sort((a, b) => (BigInt(a.address) < BigInt(b.address) ? -1 : 1)).map((s) => s.sign({ hash }))));
const h = await w.writeContract({ address: SAFE, abi, functionName: 'execTransaction', args: [...tx, concatHex([sigs, v.attestationBytes])] });
const rc = await pub.waitForTransactionReceipt({ hash: h });
console.log('voice-attested Safe tx:', rc.status, `https://sepolia.basescan.org/tx/${h}`);
const ev = JSON.parse(readFileSync('evidence/base-sepolia.json'));
ev['voice-attested transfer, guarded Safe'] = `${rc.status} https://sepolia.basescan.org/tx/${h}`;
ev['voice session (browser, spoken)'] = `heard "${v.log.find((l) => l.includes('Heard'))?.split('Heard: ')[1]}", then "Confirm."; notary MATCH; attestation over ${hash}`;
writeFileSync('evidence/base-sepolia.json', JSON.stringify(ev, null, 2));
