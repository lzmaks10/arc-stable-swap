import { ethers } from "ethers";

const RPC = "https://rpc.testnet.arc.network";
const EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
const V3 = "0x2A273eD6dDaBb7f4aDe165DbC79322D88C473139";
const USER = "0xb112A6635c2974338F8657606E5d59BF312C1241";

const p = new ethers.JsonRpcProvider(RPC);
const c = new ethers.Contract(EURC, [
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
], p);

c.allowance(USER, V3).then(r => console.log("allowance:", r.toString())).catch(e => console.log("allowance FAIL:", e.message.slice(0, 80)));

// Also check if the EURC token contract has these functions by getting the code
p.getCode(EURC).then(code => {
  console.log("EURC has code:", code.length > 2);
}).catch(e => console.log("code check FAIL"));
