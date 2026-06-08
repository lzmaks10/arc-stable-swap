import { ethers } from "ethers";

const RPC = "https://rpc.testnet.arc.network";
const V3 = "0x2A273eD6dDaBb7f4aDe165DbC79322D88C473139";
const USDC = "0x3600000000000000000000000000000000000000";
const EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

const p = new ethers.JsonRpcProvider(RPC);

// ABI for the v3 contract
const abi = [
  "function getPool(uint256) view returns (address,uint8,uint256,uint256,uint256,uint256,uint256,bool)",
  "function getAmountOut(uint256,address,uint256) view returns (uint256,uint256)",
  "function poolCount() view returns (uint256)",
];

const c = new ethers.Contract(V3, abi, p);

async function test() {
  // Check pool
  const pool = await c.getPool(1);
  console.log("Pool:");
  console.log("  token1:", pool[0]);
  console.log("  A:", pool[2].toString());
  console.log("  fee:", pool[3].toString());
  console.log("  reserve0:", ethers.formatUnits(pool[4], 6));
  console.log("  reserve1:", ethers.formatUnits(pool[5], 6));
  console.log("  liqTotal:", ethers.formatUnits(pool[6], 6));

  // Test various amounts
  console.log("\ngetAmountOut tests:");
  const amounts = [100, 500, 1000, 2000, 5000, 10000, 50000];
  for (const amt of amounts) {
    try {
      const r = await c.getAmountOut(1, USDC, ethers.parseUnits(String(amt), 6));
      console.log(`  ${amt} USDC→EURC: ${ethers.formatUnits(r[0], 6)} EURC (fee: ${ethers.formatUnits(r[1], 6)})`);
    } catch(e) {
      console.log(`  ${amt} USDC→EURC: FAIL - ${e.message.slice(0, 60)}`);
    }
  }

  // Also test EURC to USDC
  for (const amt of amounts) {
    try {
      const r = await c.getAmountOut(1, EURC, ethers.parseUnits(String(amt), 6));
      console.log(`  ${amt} EURC→USDC: ${ethers.formatUnits(r[0], 6)} USDC (fee: ${ethers.formatUnits(r[1], 6)})`);
    } catch(e) {
      console.log(`  ${amt} EURC→USDC: FAIL - ${e.message.slice(0, 60)}`);
    }
  }
}

test().catch(e => console.error(e));
