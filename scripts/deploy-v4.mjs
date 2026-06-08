import { ethers } from "ethers";
import { readFileSync, writeFileSync } from "fs";

const RPC = "https://rpc.testnet.arc.network";
const USDC = "0x3600000000000000000000000000000000000000";
const EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

const env = readFileSync("../../.env", "utf8");
const pkMatch = env.match(/PRIVATE_KEY=0x([a-fA-F0-9]+)/);
const PK = "0x" + pkMatch[1];

const compiled = JSON.parse(readFileSync("../out/StableSwapDEX.sol/StableSwapDEX.json", "utf8"));

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PK, provider);
  console.log("Deployer:", await wallet.getAddress());

  // Deploy
  const factory = new ethers.ContractFactory(compiled.abi, compiled.bytecode, wallet);
  console.log("Deploying StableSwapDEX v4...");
  const contract = await factory.deploy(USDC, { gasLimit: 5000000 });
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log("Deployed:", addr);

  // Create pool (EURC, A=200, 4bps)
  let tx = await contract.createPool(EURC, 6, 200, 4);
  await tx.wait();
  console.log("Pool #1 created");

  // Add initial liquidity: 100K USDC + 10K EURC
  const eurcToken = new ethers.Contract(EURC, ["function approve(address,uint256) returns (bool)"], wallet);
  const usdcToken = new ethers.Contract(USDC, ["function approve(address,uint256) returns (bool)"], wallet);

  const amtUSDC = ethers.parseUnits("100000", 6);
  const amtEURC = ethers.parseUnits("10000", 6);

  console.log("Approving...");
  tx = await usdcToken.approve(addr, amtUSDC);
  await tx.wait();
  tx = await eurcToken.approve(addr, amtEURC);
  await tx.wait();

  console.log("Adding liquidity...");
  tx = await contract.addLiquidity(1, amtUSDC, amtEURC, 0n);
  await tx.wait();
  console.log("Liquidity added!");

  // Verify
  const pool = await contract.getPool(1);
  console.log("Pool:", ethers.formatUnits(pool[4], 6), "USDC /", ethers.formatUnits(pool[5], 6), "EURC");

  // Save contract-info.json
  const info = {
    network: "Arc Testnet",
    chainId: 5042002,
    rpc: RPC,
    usdc: USDC,
    contract: addr,
    abi: compiled.abi,
  };
  writeFileSync("../frontend/contract-info.json", JSON.stringify(info, null, 2));
  console.log("contract-info.json saved");

  // Generate embed
  let embed = `// Contract info (embedded)\n`;
  embed += `var EMBEDDED_CONTRACT = "${addr}";\n`;
  embed += `var EMBEDDED_ABI = ${JSON.stringify(compiled.abi)};\n`;
  writeFileSync("../frontend/contract-embed.js", embed);
  console.log("contract-embed.js generated");

  // Test getAmountOut
  console.log("\n--- getAmountOut tests ---");
  for (const amt of [100, 500, 1000, 2000, 5000, 10000, 50000]) {
    for (const [sym, tok] of [["USDC", USDC], ["EURC", EURC]]) {
      try {
        const r = await contract.getAmountOut(1, tok, ethers.parseUnits(String(amt), 6));
        const outSym = sym === "USDC" ? "EURC" : "USDC";
        console.log(`  ${amt} ${sym}→${outSym}: ${ethers.formatUnits(r[0], 6)}`);
      } catch(e) {
        console.log(`  ${amt} ${sym}→X: FAIL - ${e.message.slice(0,50)}`);
      }
    }
  }

  // Test single-sided LP
  console.log("\n--- addLiquiditySingle test ---");
  tx = await usdcToken.approve(addr, ethers.parseUnits("5000", 6));
  await tx.wait();
  try {
    tx = await contract.addLiquiditySingle(1, ethers.parseUnits("5000", 6), 0n);
    await tx.wait();
    const p2 = await contract.getPool(1);
    console.log("After single-sided LP:", ethers.formatUnits(p2[4], 6), "USDC /", ethers.formatUnits(p2[5], 6), "EURC");
  } catch(e) {
    console.log("addLiquiditySingle FAILED:", e.message.slice(0, 80));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
