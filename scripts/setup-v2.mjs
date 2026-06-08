import { ethers } from "ethers";
import { readFileSync } from "fs";

const RPC = "https://rpc.testnet.arc.network";
const provider = new ethers.JsonRpcProvider(RPC);
const env = readFileSync("C:/Users/15750/.openclaw/workspace/.env", "utf-8");
const pk = env.match(/^PRIVATE_KEY\s*=\s*(0x[a-fA-F0-9]{64})\s*$/m)[1];
const wallet = new ethers.Wallet(pk, provider);
const deployer = await wallet.getAddress();
console.log("Deployer:", deployer);

const USDC = "0x3600000000000000000000000000000000000000";
const EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
const SWAP = "0xa07d7756c32eCB0ad58D644FBEFA241AEA465169";

// ERC20
const erc20 = ["function balanceOf(address) view returns (uint256)", "function approve(address, uint256) returns (bool)", "function allowance(address, address) view returns (uint256)"];
const usdc = new ethers.Contract(USDC, erc20, wallet);
const eurc = new ethers.Contract(EURC, erc20, wallet);
const balUSDC = await usdc.balanceOf(deployer);
const balEURC = await eurc.balanceOf(deployer);
console.log(`Bal: ${ethers.formatUnits(balUSDC, 6)} USDC, ${ethers.formatUnits(balEURC, 6)} EURC`);

// Swap ABI
const swapAbi = [
  "function createPool(address _token1, uint8 _decimals1, uint256 _A, uint256 _swapFee) returns (uint256)",
  "function addLiquidity(uint256 id, uint256 amount0, uint256 amount1, uint256 minShares) returns (uint256 shares)",
  "function swap(uint256 id, address tokenIn, uint256 amountIn, uint256 minAmountOut) returns (uint256 amountOut)",
  "function poolCount() view returns (uint256)",
  "function getPool(uint256 id) view returns (address token1, uint8 decimals1, uint256 A, uint256 swapFee, uint256 reserve0, uint256 reserve1, uint256 liquidityTotal, bool active)",
  "function getAmountOut(uint256 id, address tokenIn, uint256 amountIn) view returns (uint256, uint256)",
  "function getLpShares(uint256 id, address lp) view returns (uint256)",
  "function pendingFees(uint256 id, address lp) view returns (uint256)",
];
const swap = new ethers.Contract(SWAP, swapAbi, wallet);

// 1. Approve
console.log("\n=== Approve ===");
const NEED = 500000n * 1000000n;
let a1 = await usdc.allowance(deployer, SWAP);
if (a1 < NEED) { let tx = await usdc.approve(SWAP, NEED); await tx.wait(); console.log("USDC approved"); }
let a2 = await eurc.allowance(deployer, SWAP);
if (a2 < NEED) { let tx = await eurc.approve(SWAP, NEED); await tx.wait(); console.log("EURC approved"); }

// 2. Create pool
console.log("\n=== Create Pool ===");
let pc = await swap.poolCount();
console.log("Pool count:", Number(pc));
if (pc === 0n) {
  let tx = await swap.createPool(EURC, 6, 200, 4, { gasLimit: 500000 });
  await tx.wait();
  console.log("Pool created:", tx.hash);
  pc = await swap.poolCount();
}
// Pool ID is poolCount (++poolCount), so id = poolCount, not poolCount - 1
const PID = pc;  // pc = poolCount after creation
console.log("Pool ID:", PID.toString());

// 3. Add liquidity
console.log("\n=== Add Liquidity ===");
const USDC_AMT = 100000n * 1000000n;
const EURC_AMT = 10000n * 1000000n;
let tx = await swap.addLiquidity(PID, USDC_AMT, EURC_AMT, 1n, { gasLimit: 500000 });
await tx.wait();
console.log("Liquidity added:", tx.hash);

const pool = await swap.getPool(PID);
console.log(`Reserves: ${ethers.formatUnits(pool.reserve0, 6)} USDC / ${ethers.formatUnits(pool.reserve1, 6)} EURC`);
console.log(`LP supply: ${ethers.formatUnits(pool.liquidityTotal, 18)}`);

// 4. Quote and swap
console.log("\n=== Swaps ===");

// Swap 2000 USDC -> EURC
console.log("Swap 1: 2000 USDC -> EURC");
let [out, fee] = await swap.getAmountOut(PID, USDC, 2000n * 1000000n);
console.log(`  Quote: ${ethers.formatUnits(out, 6)} EURC (fee: ${ethers.formatUnits(fee, 6)})`);
tx = await swap.swap(PID, USDC, 2000n * 1000000n, (out * 995n) / 1000n, { gasLimit: 300000 });
await tx.wait();
console.log("  Done:", tx.hash);

// Swap 1500 EURC -> USDC
console.log("Swap 2: 1500 EURC -> USDC");
[out, fee] = await swap.getAmountOut(PID, EURC, 1500n * 1000000n);
console.log(`  Quote: ${ethers.formatUnits(out, 6)} USDC (fee: ${ethers.formatUnits(fee, 6)})`);
tx = await swap.swap(PID, EURC, 1500n * 1000000n, (out * 995n) / 1000n, { gasLimit: 300000 });
await tx.wait();
console.log("  Done:", tx.hash);

// Swap 3000 USDC -> EURC
console.log("Swap 3: 3000 USDC -> EURC");
[out, fee] = await swap.getAmountOut(PID, USDC, 3000n * 1000000n);
console.log(`  Quote: ${ethers.formatUnits(out, 6)} EURC (fee: ${ethers.formatUnits(fee, 6)})`);
tx = await swap.swap(PID, USDC, 3000n * 1000000n, (out * 995n) / 1000n, { gasLimit: 300000 });
await tx.wait();
console.log("  Done:", tx.hash);

// Final
console.log("\n=== Final ===");
const pf = await swap.getPool(PID);
console.log(`USDC reserve: ${ethers.formatUnits(pf.reserve0, 6)}`);
console.log(`EURC reserve: ${ethers.formatUnits(pf.reserve1, 6)}`);
console.log(`LP supply: ${ethers.formatUnits(pf.liquidityTotal, 18)}`);
const shares = await swap.getLpShares(PID, deployer);
console.log(`My LP shares: ${ethers.formatUnits(shares, 18)}`);
const fees = await swap.pendingFees(PID, deployer);
console.log(`Pending fees: ${ethers.formatUnits(fees, 6)} USDC`);
console.log("\n✅ Done!");
