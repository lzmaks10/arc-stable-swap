import { ethers } from "ethers";
import { readFileSync } from "fs";

const RPC = "https://rpc.testnet.arc.network";
const V3 = "0x2A273eD6dDaBb7f4aDe165DbC79322D88C473139";
const USDC = "0x3600000000000000000000000000000000000000";
const EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

const env = readFileSync("../../.env", "utf8");
const pkMatch = env.match(/PRIVATE_KEY=0x([0-9a-fA-F]+)/);
if (!pkMatch) throw new Error("No PK");
const PK = "0x" + pkMatch[1];

async function main() {
  const p = new ethers.JsonRpcProvider(RPC);
  const w = new ethers.Wallet(PK, p);
  const addr = await w.getAddress();
  console.log("User:", addr);

  const abi = [
    "function allowance(address,address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
  ];
  const usdc = new ethers.Contract(USDC, abi, w);
  const eurc = new ethers.Contract(EURC, abi, w);

  const balU = await usdc.balanceOf(addr);
  const balE = await eurc.balanceOf(addr);
  console.log("USDC:", ethers.formatUnits(balU, 6), "EURC:", ethers.formatUnits(balE, 6));

  const poolAbi = [
    "function addLiquidity(uint256,uint256,uint256,uint256) returns (uint256)",
    "function getPool(uint256) view returns (address,uint8,uint256,uint256,uint256,uint256,uint256,bool)",
  ];
  const pool = new ethers.Contract(V3, poolAbi, w);
  const poolInfo = await pool.getPool(1);
  console.log("Pool reserves:", ethers.formatUnits(poolInfo[4], 6), "/", ethers.formatUnits(poolInfo[5], 6));

  const amountIn = ethers.parseUnits("1000", 6);
  const eurcAmt = amountIn * poolInfo[5] / poolInfo[4];  // proportional

  console.log("Adding:", ethers.formatUnits(amountIn, 6), "USDC +", ethers.formatUnits(eurcAmt, 6), "EURC");

  // Check allowances
  const allowU = await usdc.allowance(addr, V3);
  const allowE = await eurc.allowance(addr, V3);
  console.log("Allowances - USDC:", ethers.formatUnits(allowU, 6), "EURC:", ethers.formatUnits(allowE, 6));

  // Approve both
  if (allowU < amountIn) {
    console.log("Approving USDC...");
    let tx = await usdc.approve(V3, amountIn);
    await tx.wait();
    console.log("USDC approved");
  }
  if (allowE < eurcAmt) {
    console.log("Approving EURC...");
    let tx = await eurc.approve(V3, eurcAmt);
    await tx.wait();
    console.log("EURC approved");
  }

  // Add liquidity
  console.log("Adding liquidity...");
  const tx = await pool.addLiquidity(1, amountIn, eurcAmt, 0n);
  const receipt = await tx.wait();
  console.log("Success! tx:", tx.hash);
  console.log("Gas used:", receipt.gasUsed.toString());

  const pool2 = await pool.getPool(1);
  console.log("New reserves:", ethers.formatUnits(pool2[4], 6), "/", ethers.formatUnits(pool2[5], 6));
}

main().catch(e => { console.error("FAILED:", e.reason || e.message); process.exit(1); });
