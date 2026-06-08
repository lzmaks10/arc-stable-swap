// Setup initial liquidity for v6 pool
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dir = path.dirname(fileURLToPath(import.meta.url));

const RPC = "https://rpc.testnet.arc.network";

function readEnvVar(name) {
  try {
    var lines = fs.readFileSync(path.join(__dir, "..", "..", ".env"), "utf8").split("\n");
    for (var l of lines) {
      var m = l.match(new RegExp(name + "=(.+)")); if (m) return m[1].trim();
    }
  } catch(e) {}
  return null;
}

var pk = readEnvVar("PRIVATE_KEY");
if (!pk) { console.error("No PK"); process.exit(1); }

const USDC = "0x3600000000000000000000000000000000000000";
const EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
const DEX = "0x61943D78c488755d7126d86056B54bF55859039D";

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(pk, provider);
  const addr = await wallet.getAddress();
  console.log("Wallet:", addr);

  // Read ABI
  const art = JSON.parse(fs.readFileSync(path.join(__dir, "..", "out", "StableSwapDEX.sol", "StableSwapDEX.json"), "utf8"));
  const dex = new ethers.Contract(DEX, art.abi, wallet);

  // Fund USDC from deployer wallet to pool
  var amtUSDC = ethers.parseUnits("100000", 6); // 100K USDC
  var amtEURC = ethers.parseUnits("6000", 6);   // 6K EURC (wallet has ~6455)

  // Check balance
  var usdcC = new ethers.Contract(USDC, ["function balanceOf(address) view returns (uint256)"], provider);
  var eurcC = new ethers.Contract(EURC, ["function balanceOf(address) view returns (uint256)"], provider);

  var balU = await usdcC.balanceOf(addr);
  var balE = await eurcC.balanceOf(addr);
  console.log("USDC:", ethers.formatUnits(balU, 6));
  console.log("EURC:", ethers.formatUnits(balE, 6));

  // Approve both
  var usdcT = new ethers.Contract(USDC, ["function approve(address,uint256) returns (bool)"], wallet);
  var eurcT = new ethers.Contract(EURC, ["function approve(address,uint256) returns (bool)"], wallet);

  console.log("Approving USDC...");
  var tx = await usdcT.approve(DEX, amtUSDC);
  await tx.wait();

  console.log("Approving EURC...");
  tx = await eurcT.approve(DEX, amtEURC);
  await tx.wait();

  console.log("Adding liquidity...");
  tx = await dex.addLiquidity(1, amtUSDC, amtEURC, 0n);
  await tx.wait();
  console.log("✅ Liquidity added!");

  // Check pool
  var pool = await dex.pools(1);
  console.log("\nPool state:");
  console.log("  reserve0:", ethers.formatUnits(pool.reserve0, 6));
  console.log("  reserve1:", ethers.formatUnits(pool.reserve1, 6));
  console.log("  liquidityTotal:", pool.liquidityTotal.toString());

  // Check LP balance
  var lpAddr = await dex.getLpToken(1);
  var lp = new ethers.Contract(lpAddr, [
    "function balanceOf(address) view returns (uint256)",
    "function totalSupply() view returns (uint256)",
    "function name() view returns (string)",
    "function symbol() view returns (string)"
  ], provider);
  var lpBal = await lp.balanceOf(addr);
  var lpTotal = await lp.totalSupply();
  console.log("  LP Token:", lpAddr);
  console.log("  LP balance:", ethers.formatUnits(lpBal, 6));
  console.log("  LP totalSupply:", ethers.formatUnits(lpTotal, 6));
}

main().catch(console.error);
