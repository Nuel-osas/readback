/**
 * Three transactions a wallet might be handed, each built as real calldata
 * against real Base mainnet contracts. What the *site* claims is on the card;
 * what the transaction does is only ever learned by decoding it.
 *
 * The addresses standing in for the bad actors are real on-chain states chosen
 * for their properties (no history; unverified and freshly deployed). Readback
 * describes them only from what the chain says. Nothing here asserts anything
 * about who controls them.
 */
import { encodeFunctionData, getAddress, maxUint256, parseAbi, parseEther, parseUnits } from 'viem';

const abi = parseAbi([
  'function approve(address,uint256)',
  'function transfer(address,uint256)',
  'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96))',
  'function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)',
]);

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const WETH = '0x4200000000000000000000000000000000000006';
const ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481';
const NO_HISTORY = getAddress('0x3f9b6c0e5a21d4e7b8c90a1f2e3d4c5b6a7980f1');
const UNVERIFIED = getAddress('0x673342b4522B6a9E25c7902b9E3721ea9b58b725');
const SAFE = getAddress('0x4f2083f5fbede34c2714affb3105539775f7fe64');
const ZERO = '0x0000000000000000000000000000000000000000';

export const SCENARIOS = [
  {
    id: 'swap',
    site: 'app.uniswap.org',
    claim: 'Swap 100 USDC for ETH',
    hint: 'Try saying: "swap a hundred USDC for ETH"',
    build: (me) => ({
      from: me, to: ROUTER, value: '0x0',
      data: encodeFunctionData({ abi, functionName: 'exactInputSingle', args: [{ tokenIn: USDC, tokenOut: WETH, fee: 500, recipient: me, amountIn: parseUnits('100', 6), amountOutMinimum: parseEther('0.02'), sqrtPriceLimitX96: 0n }] }),
    }),
  },
  {
    id: 'airdrop',
    site: 'base-rewards.claims',
    claim: 'Claim your 500 BASE airdrop',
    hint: 'Try saying: "claim my airdrop"',
    build: (me) => ({
      from: me, to: USDC, value: '0x0',
      data: encodeFunctionData({ abi, functionName: 'approve', args: [NO_HISTORY, maxUint256] }),
    }),
  },
  {
    id: 'safe',
    site: 'app.safe.global',
    claim: 'Move 1 ETH to your cold wallet',
    hint: 'Try saying: "send one ETH to my cold wallet"',
    note: 'The shape of the February 2025 Bybit attack',
    build: (me) => ({
      from: me, to: SAFE, value: '0x0',
      data: encodeFunctionData({
        abi, functionName: 'execTransaction',
        args: [UNVERIFIED, 0n, encodeFunctionData({ abi, functionName: 'transfer', args: [me, parseEther('1')] }), 1, 0n, 0n, 0n, ZERO, ZERO, '0x'],
      }),
    }),
  },
];

export const DEMO_SENDER = getAddress('0x1111111111111111111111111111111111111111');
