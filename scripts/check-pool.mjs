import { ethers } from "ethers";

const rpc = "https://rpc.testnet.arc.network";
const contractAddr = "0xa07d7756c32eCB0ad58D644FBEFA241AEA465169";
const poolId = 1;

const p = new ethers.JsonRpcProvider(rpc);
const abi = ["function getPool(uint256) view returns (address,uint8,uint256,uint256,uint256,uint256,uint256,bool)"];
const c = new ethers.Contract(contractAddr, abi, p);

c.getPool(poolId).then(r => {
  console.log("token1:", r[0]);
  console.log("decimals1:", Number(r[1]));
  console.log("A:", r[2].toString());
  console.log("swapFee:", r[3].toString());
  console.log("reserve0:", ethers.formatUnits(r[4], 6));
  console.log("reserve1:", ethers.formatUnits(r[5], 6));
  console.log("liqTotal:", ethers.formatUnits(r[6], 6));
  console.log("active:", r[7]);
}).catch(e => console.log("Error:", e.message));
