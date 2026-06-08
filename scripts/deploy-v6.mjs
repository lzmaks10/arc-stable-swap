// Deploy StableSwapDEX v6 (with ERC20 LP Token)
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dir = path.dirname(fileURLToPath(import.meta.url));

// Arc Testnet
const RPC = "https://rpc.testnet.arc.network";
const CHAIN_ID = 5042002;

// Deployer wallet: try env, then .env file
const PK = process.env.DEPLOYER_PK || process.env.PRIVATE_KEY;
function readEnvVar(name) {
  try {
    var lines = fs.readFileSync(path.join(__dir, "..", "..", ".env"), "utf8").split("\n");
    for (var l of lines) {
      var m = l.match(new RegExp(name + "=(.+)"));
      if (m) return m[1].trim();
    }
  } catch(e) {}
  return null;
}
const finalPK = PK || readEnvVar("PRIVATE_KEY");
if (!finalPK) { console.error("❌ Private key not found. Set PRIVATE_KEY in .env"); process.exit(1); }
var pk = finalPK.startsWith("0x") ? finalPK : "0x" + finalPK;

// Token addresses (Arc Testnet)
const USDC = "0x3600000000000000000000000000000000000000";
const EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(pk, provider);
  const addr = await wallet.getAddress();
  console.log("Deployer:", addr);

  // Read compiled artifact
  const artifactPath = path.join(__dir, "..", "out", "StableSwapDEX.sol", "StableSwapDEX.json");
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const abi = artifact.abi;
  const bytecode = artifact.bytecode;

  // Create factory
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);

  console.log("Deploying StableSwapDEX v6...");
  const dex = await factory.deploy(USDC);
  await dex.waitForDeployment();
  const dexAddr = await dex.getAddress();
  console.log("✅ StableSwapDEX v6 deployed at:", dexAddr);

  // Create the USDC/EURC pool
  console.log("Creating pool USDC/EURC...");
  const A = 200;
  const swapFee = 4; // 4 bps
  const tx = await dex.createPool(EURC, 6, A, swapFee);
  await tx.wait();
  console.log("✅ Pool created!");

  // Check pool
  const pool = await dex.pools(1);
  console.log("\nPool 1:");
  console.log("  token1:", pool.token1);
  console.log("  A:", pool.A.toString());
  console.log("  swapFee:", pool.swapFee.toString());
  console.log("  adminFee:", pool.adminFee.toString());
  console.log("  reserve0:", pool.reserve0.toString());
  console.log("  reserve1:", pool.reserve1.toString());
  console.log("  liquidityTotal:", pool.liquidityTotal.toString());

  // LP Token
  const lpTokenAddr = await dex.getLpToken(1);
  console.log("  LP Token:", lpTokenAddr);
  const lpToken = new ethers.Contract(lpTokenAddr, [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)"
  ], provider);
  console.log("  LP name:", await lpToken.name());
  console.log("  LP symbol:", await lpToken.symbol());
  console.log("  LP decimals:", (await lpToken.decimals()).toString());
  console.log("  LP totalSupply:", (await lpToken.totalSupply()).toString());

  console.log("\n✅ Done!");
  console.log("Contract:", dexAddr);
  console.log("LP Token:", lpTokenAddr);
}

main().catch(console.error);
