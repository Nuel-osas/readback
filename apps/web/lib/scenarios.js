/**
 * Transactions a wallet might be handed. What the SITE claims is on the card; what the
 * transaction does is only ever learned by decoding it, and only shown after the signer
 * has said what they think it does.
 *
 * Addresses standing in for bad actors are real on-chain states picked for their
 * properties (no history; unverified). Readback describes them only from chain data.
 */
import { encodeFunctionData, getAddress, maxUint256, parseAbi, parseEther, parseUnits } from 'viem';

const abi = parseAbi([
  'function approve(address,uint256)',
  'function transfer(address,uint256)',
  'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96))',
]);

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const WETH = '0x4200000000000000000000000000000000000006';
const ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481';
const NO_HISTORY = getAddress('0x3f9b6c0e5a21d4e7b8c90a1f2e3d4c5b6a7980f1');

/** The guarded 2-of-2 Safe from evidence/base-sepolia.json, protected by the deployed ReadbackGuard. */
export const DEMO_SAFE = getAddress('0x48aB94CfED0045456DfcD750Bf419199a5fa11d5');
export const GUARD = { 84532: getAddress('0xAA3356D3E0237898a3A613E111625043A1614355') };
const BYBIT_SHAPE = getAddress('0x60b70BC2E774d7A781138009A28B2917893dc98A');
const COLD_WALLET = getAddress('0x7adcCAD209A23b730Ea3E637A1Eb09b51CbD2170');

export const SCENARIOS = [
  {
    id: 'swap', chainId: 8453, site: 'app.uniswap.org', claim: 'Swap 100 USDC for ETH', kind: 'Wallet',
    hint: '“swap a hundred USDC for ETH”',
    build: (me) => ({ to: ROUTER, value: '0', data: encodeFunctionData({ abi, functionName: 'exactInputSingle', args: [{ tokenIn: USDC, tokenOut: WETH, fee: 500, recipient: me, amountIn: parseUnits('100', 6), amountOutMinimum: parseEther('0.02'), sqrtPriceLimitX96: 0n }] }) }),
  },
  {
    id: 'airdrop', chainId: 8453, site: 'base-rewards.claims', claim: 'Claim your 500 BASE airdrop', kind: 'Wallet',
    hint: '“claim my airdrop”',
    build: () => ({ to: USDC, value: '0', data: encodeFunctionData({ abi, functionName: 'approve', args: [NO_HISTORY, maxUint256] }) }),
  },
  {
    id: 'safe-send', chainId: 84532, site: 'app.safe.global', claim: 'Move 0.0001 ETH to your cold wallet', kind: 'Safe · guarded',
    hint: '“send point zero zero zero one ETH to my cold wallet”', safe: DEMO_SAFE,
    build: () => ({ to: COLD_WALLET, value: parseEther('0.0001').toString(), data: '0x', operation: 0 }),
  },
  {
    id: 'safe-bybit', chainId: 84532, site: 'app.safe.global', claim: 'Move 1 ETH to your cold wallet', kind: 'Safe · guarded', note: 'The Bybit shape, against a real guarded Safe',
    hint: '“send one ETH to my cold wallet”', safe: DEMO_SAFE,
    build: () => ({ to: BYBIT_SHAPE, value: '0', operation: 1, data: encodeFunctionData({ abi, functionName: 'transfer', args: [BYBIT_SHAPE, 0n] }) }),
  },
];

export const DEMO_SENDER = getAddress('0x1111111111111111111111111111111111111111');
export const EXPLORERS = { 8453: 'https://basescan.org', 84532: 'https://sepolia.basescan.org' };
export const EVIDENCE = {
  guard: 'https://base-sepolia.blockscout.com/address/0xAA3356D3E0237898a3A613E111625043A1614355?tab=contract',
  honest: 'https://sepolia.basescan.org/tx/0x1ecb75a4b62be2006ea94168e2232ec0a371ed3e6eb2fa72b05ae5f23ab42c69',
  blocked: 'https://sepolia.basescan.org/tx/0x8e3c182b7ae8eff58907db8cd6c35699049413e6f5c88958384e197f8eed8bd8',
  control: 'https://sepolia.basescan.org/tx/0x7919e8e9d0556cdb54f3045e97d6f1251ffc4d4cc06682d92190ec35fe4dae11',
};
