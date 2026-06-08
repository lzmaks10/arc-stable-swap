import { ethers } from "ethers";

const rpc = "https://rpc.testnet.arc.network";
const contractAddr = "0xa07d7756c32eCB0ad58D644FBEFA241AEA465169";
const usdc = "0x3600000000000000000000000000000000000000";
const eurc = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
const poolId = 1;

const p = new ethers.JsonRpcProvider(rpc);
const abi = ["function getAmountOut(uint256,address,uint256) view returns (uint256,uint256)"];
const c = new ethers.Contract(contractAddr, abi, p);

async function test(amount) {
  try {
    const r = await c.getAmountOut(poolId, usdc, ethers.parseUnits(amount.toString(), 6));
    console.log(`Swap ${amount} USDC → EURC: amountOut=${ethers.formatUnits(r[0], 6)} EURC, fee=${ethers.formatUnits(r[1], 6)}`);
  } catch(e) {
    console.log(`Swap ${amount} USDC → EURC: FAILED - ${e.message.slice(0, 80)}`);
  }
  try {
    const r = await c.getAmountOut(poolId, eurc, ethers.parseUnits(amount.toString(), 6));
    console.log(`Swap ${amount} EURC → USDC: amountOut=${ethers.formatUnits(r[0], 6)} USDC, fee=${ethers.formatUnits(r[1], 6)}`);
  } catch(e) {
    console.log(`Swap ${amount} EURC → USDC: FAILED - ${e.message.slice(0, 80)}`);
  }
}

(async () => {
  await test(100);
  await test(500);
  await test(1000);
  await test(2000);
  await test(5000);
  await test(10000);
})();
