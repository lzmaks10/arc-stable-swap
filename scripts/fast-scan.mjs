import { ethers } from "ethers";

const RPC = "https://rpc.testnet.arc.network";
const provider = new ethers.JsonRpcProvider(RPC);
const deployer = "0xb112A6635c2974338F8657606E5d59BF312C1241";

// EURC symbolic function selector
const symbolSelector = "0x95d89b41"; // keccak256("symbol()")[:4]
const balanceSelector = "0x70a08231"; // keccak256("balanceOf(address)")[:4]
const nameSelector = "0x06fdde03"; // keccak256("name()")[:4]

const deployerArg = ethers.zeroPadValue(deployer, 32);

// Try many more addresses using eth_call
async function checkToken(addr) {
  const symbolCall = { to: addr, data: symbolSelector };
  const balanceCall = { to: addr, data: balanceSelector + deployerArg.slice(2) };
  
  try {
    const [symbolResult, balanceResult] = await Promise.all([
      provider.call(symbolCall),
      provider.call(balanceCall)
    ]);
    
    const balance = BigInt(balanceResult);
    if (balance > 0n) {
      // Decode symbol
      const symbolLen = parseInt(symbolResult.slice(66, 130), 16);
      const symbol = ethers.toUtf8String("0x" + symbolResult.slice(130, 130 + symbolLen * 2));
      
      // Also get name and decimals
      const nameResult = await provider.call({ to: addr, data: nameSelector });
      const nameLen = parseInt(nameResult.slice(66, 130), 16);
      const name = ethers.toUtf8String("0x" + nameResult.slice(130, 130 + nameLen * 2));
      
      console.log(`✅ ${addr}: ${name} (${symbol}) - balance: ${balance.toString()}`);
      return true;
    }
  } catch (e) {
    // No contract or not a token
  }
  return false;
}

// Check a wide range of addresses
// USDC is at 0x3600000000000000000000000000000000000000
// Let's check many more addresses in the same prefix
const prefix = "0x360000000000000000000000000000000000";

console.log("Scanning tokens in 0x3600 prefix...");
let found = false;
for (let i = 0; i <= 255; i++) {
  const addr = prefix + i.toString(16).padStart(2, "0");
  if (await checkToken(addr)) {
    found = true;
  }
}

// If nothing found, check other common prefixes
if (!found) {
  console.log("\nNothing in 0x3600 range. Checking other patterns...");
  // Arc testnet might use different prefixes
  // Let's check a batch of well-known addresses
  const extraAddrs = [
    "0x5C80a2Dc9610E6B293d2a6323E8b0748EEa13153",
    "0x07865c6E87B9F70255377e024ace6630C1Eaa37F",
    "0x1aF3F329e8be154074D8769D1FFa4eE058B1DBc3",
    "0x833589fCD6eDb6E08f2c6C63f1d71F065d78241F",
    "0xB9062896ec3A615a4e4444DF183F0531A7B5E22B",
    "0x7cA3A00b3B6b1e79Bd67e4Da7b8C4F3EfE61b9B5",
    "0x3d1E5b1607B1c29aC52b82EF8aC1379F4B7c4f9D",
    "0xA9bA2D1d0F5BC1D94b1E7E2b8c9F6B0C8B6e1d9f",
    "0x0000000000000000000000000000000000003600",
    "0x3600000000000000000000000000000000001000",
    "0x3600000000000000000000000000000000002000",
    "0x3600000000000000000000000000000000003000",
    "0x3600000000000000000000000000000000004000",
    "0x3600000000000000000000000000000000005000",
    "0x3600000000000000000000000000000000006000",
    "0x3600000000000000000000000000000000007000",
    "0x3600000000000000000000000000000000008000",
    "0x3600000000000000000000000000000000009000",
    "0x3600000000000000000000000000000000001000",
    "0x360000000000000000000000000000000000000E",
    "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  ];
  
  for (const addr of extraAddrs) {
    if (await checkToken(addr)) found = true;
  }
}

if (!found) {
  console.log("\n❌ No EURC-like token found with non-zero balance for deployer");
}
