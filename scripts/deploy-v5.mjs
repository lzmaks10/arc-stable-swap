import { ethers } from "ethers";
import { readFileSync, writeFileSync } from "fs";

const RPC = "https://rpc.testnet.arc.network";
const USDC = "0x3600000000000000000000000000000000000000";
const EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

const env = readFileSync("../../.env", "utf8");
const pkLine = env.split("\n").find(l => l.startsWith("PRIVATE_KEY="));
const PK = pkLine.replace("PRIVATE_KEY=", "").trim();

const compiled = JSON.parse(readFileSync("../out/StableSwapDEX.sol/StableSwapDEX.json", "utf8"));

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PK, provider);
  const deployer = await wallet.getAddress();
  console.log("Deployer:", deployer);

  // Deploy
  const factory = new ethers.ContractFactory(compiled.abi, compiled.bytecode, wallet);
  console.log("Deploying v5 (fixed addLiquiditySingle)...");
  const contract = await factory.deploy(USDC, { gasLimit: 5000000 });
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log("Deployed:", addr);

  // Create pool
  let tx = await contract.createPool(EURC, 6, 200, 4);
  await tx.wait();
  console.log("Pool #1 created");

  // Add initial liquidity
  const eurcToken = new ethers.Contract(EURC, ["function approve(address,uint256) returns (bool)"], wallet);
  const usdcToken = new ethers.Contract(USDC, ["function approve(address,uint256) returns (bool)"], wallet);

  const amtUSDC = ethers.parseUnits("100000", 6);
  const amtEURC = ethers.parseUnits("10000", 6);

  tx = await usdcToken.approve(addr, amtUSDC);
  await tx.wait();
  tx = await eurcToken.approve(addr, amtEURC);
  await tx.wait();

  tx = await contract.addLiquidity(1, amtUSDC, amtEURC, 0n);
  await tx.wait();
  console.log("Liquidity added");

  // Save new contract info
  const info = {
    network: "Arc Testnet",
    chainId: 5042002,
    rpc: RPC,
    usdc: USDC,
    contract: addr,
    abi: compiled.abi,
  };
  writeFileSync("../frontend/contract-info.json", JSON.stringify(info, null, 2));

  // Generate embed JS
  let embed = `// Contract info (embedded)\n`;
  embed += `var EMBEDDED_CONTRACT = "${addr}";\n`;
  embed += `var EMBEDDED_ABI = ${JSON.stringify(compiled.abi)};\n`;
  writeFileSync("../frontend/contract-embed.js", embed);
  console.log("Contract info saved");

  // Test getAmountOut
  console.log("\n=== getAmountOut tests ===");
  for (const amt of [100, 500, 1000, 5000]) {
    for (const [sym, tok] of [["USDC", USDC], ["EURC", EURC]]) {
      const r = await contract.getAmountOut(1, tok, ethers.parseUnits(String(amt), 6));
      const outSym = sym === "USDC" ? "EURC" : "USDC";
      console.log(`  ${amt} ${sym}→${outSym}: ${ethers.formatUnits(r[0], 6)}`);
    }
  }

  // Test addLiquiditySingle
  console.log("\n=== addLiquiditySingle test ===");
  tx = await usdcToken.approve(addr, ethers.parseUnits("5000", 6));
  await tx.wait();
  tx = await contract.addLiquiditySingle(1, ethers.parseUnits("5000", 6), 0n);
  await tx.wait();
  const p = await contract.getPool(1);
  console.log(`Pool: ${ethers.formatUnits(p[4], 6)} USDC / ${ethers.formatUnits(p[5], 6)} EURC`);
  console.log("LiquidityTotal:", ethers.formatUnits(p[6], 0));
  
  // Verify shares
  const shares = await contract.getLpShares(1, deployer);
  console.log("LP shares:", ethers.formatUnits(shares, 0));

  // Test swap
  console.log("\n=== Swap test ===");
  const result = await contract.getAmountOut(1, USDC, ethers.parseUnits("1000", 6));
  console.log("1000 USDC→EURC:", ethers.formatUnits(result[0], 6));
}

main().catch(e => { console.error(e); process.exit(1); });
