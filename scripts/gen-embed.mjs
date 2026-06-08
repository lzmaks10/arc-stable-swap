// Extract ABI as inline JS snippet
import { readFileSync, writeFileSync } from "fs";

const art = JSON.parse(readFileSync("out/StableSwapDEX.sol/StableSwapDEX.json", "utf8"));
const abi = art.abi;

// Add LPToken ABI for the frontend
const lpAbi = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)"
];

let out  = "// ─── StableSwapDEX v6 ABI ───\n";
out += "var EMBEDDED_CONTRACT = \"0x61943D78c488755d7126d86056B54bF55859039D\";\n";
out += "var EMBEDDED_ABI = " + JSON.stringify(abi) + ";\n\n";
out += "// ─── LPToken ABI ───\n";
out += "var LP_TOKEN_ABI = " + JSON.stringify(lpAbi) + ";\n";

writeFileSync("frontend/contract-embed.js", out);
console.log("Done. ABI entries:", abi.length);
console.log("Contract:", EMBEDDED_CONTRACT);
