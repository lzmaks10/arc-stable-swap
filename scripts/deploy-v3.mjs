import { ethers } from "ethers";
import { readFileSync, writeFileSync } from "fs";

// ─── Config ───
const RPC = "https://rpc.testnet.arc.network";
const USDC = "0x3600000000000000000000000000000000000000";
const EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

// Read private key from .env
const env = readFileSync("../../.env", "utf8");
const pkMatch = env.match(/PRIVATE_KEY=0x([0-9a-fA-F]+)/);
if (!pkMatch) throw new Error("No private key found in .env");
const PK = "0x" + pkMatch[1];

// Read compiled bytecode & ABI
const outPath = "../out/StableSwapDEX.sol/StableSwapDEX.json" ;
const infoPath = "../frontend/contract-info.json";
const compiled = JSON.parse(readFileSync(outPath, "utf8"));
const bytecode = compiled.bytecode;
const abi = compiled.abi;

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PK, provider);
  const addr = await wallet.getAddress();
  console.log("Deployer:", addr);

  // Check balance
  const bal = await provider.getBalance(addr);
  console.log("Balance:", ethers.formatEther(bal), "ETH");

  // Deploy
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  console.log("Deploying StableSwapDEX v3...");
  const contract = await factory.deploy(USDC);
  await contract.waitForDeployment();
  const contractAddr = await contract.getAddress();
  console.log("Deployed at:", contractAddr);

  // Create pool (EURC, decimals=6, A=200, fee=4bps)
  console.log("Creating pool...");
  const tx1 = await contract.createPool(EURC, 6, 200, 4);
  await tx1.wait();
  console.log("Pool created, ID: 1");

  // Get pool info
  const pool = await contract.getPool(1);
  console.log("Pool:", {
    token1: pool[0],
    decimals1: Number(pool[1]),
    A: pool[2].toString(),
    swapFee: pool[3].toString(),
    reserve0: ethers.formatUnits(pool[4], 6),
    reserve1: ethers.formatUnits(pool[5], 6),
  });

  // Add liquidity: 100,000 USDC + 10,000 EURC
  console.log("\nAdding liquidity...");

  // Need to hold EURC to add. We only have EURC on the deployer wallet.
  // Check EURC balance
  const eurcContract = new ethers.Contract(EURC, [
    "function balanceOf(address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
    "function decimals() view returns (uint8)",
  ], wallet);
  const eurcBal = await eurcContract.balanceOf(addr);
  console.log("EURC balance:", ethers.formatUnits(eurcBal, 6));
  const eurcDec = await eurcContract.decimals();
  console.log("EURC decimals:", Number(eurcDec));

  const usdcContract = new ethers.Contract(USDC, [
    "function balanceOf(address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
  ], wallet);
  const usdcBal = await usdcContract.balanceOf(addr);
  console.log("USDC balance:", ethers.formatUnits(usdcBal, 6));

  // Determine amounts
  const amountUSDC = ethers.parseUnits("100000", 6);
  const amountEURC = ethers.parseUnits("10000", 6);

  // Approve both
  console.log("Approving USDC...");
  let tx = await usdcContract.approve(contractAddr, amountUSDC);
  await tx.wait();

  console.log("Approving EURC...");
  tx = await eurcContract.approve(contractAddr, amountEURC);
  await tx.wait();

  // Add liquidity
  console.log("Adding liquidity...");
  tx = await contract.addLiquidity(1, amountUSDC, amountEURC, 0);
  await tx.wait();
  console.log("Liquidity added!");

  // Verify pool
  const pool2 = await contract.getPool(1);
  console.log("\nPool after liquidity:");
  console.log("reserve0:", ethers.formatUnits(pool2[4], 6), "USDC");
  console.log("reserve1:", ethers.formatUnits(pool2[5], 6), "EURC");
  console.log("liqTotal:", ethers.formatUnits(pool2[6], 6));

  // Save contract info
  const info = {
    network: "Arc Testnet",
    chainId: 5042002,
    rpc: RPC,
    usdc: USDC,
    contract: contractAddr,
    abi: abi,
  };
  writeFileSync(infoPath, JSON.stringify(info, null, 2));
  console.log("\ncontract-info.json updated!");

  // Test swaps
  console.log("\n--- Testing getAmountOut ---");
  for (const amt of [100, 500, 1000, 2000, 5000]) {
    try {
      const r = await contract.getAmountOut(1, USDC, ethers.parseUnits(String(amt), 6));
      console.log(`${amt} USDC → EURC: ${ethers.formatUnits(r[0], 6)} EURC`);
    } catch(e) {
      console.log(`${amt} USDC → EURC: FAILED - ${e.message.slice(0, 60)}`);
    }
    try {
      const r = await contract.getAmountOut(1, EURC, ethers.parseUnits(String(amt), 6));
      console.log(`${amt} EURC → USDC: ${ethers.formatUnits(r[0], 6)} USDC`);
    } catch(e) {
      console.log(`${amt} EURC → USDC: FAILED - ${e.message.slice(0, 60)}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
