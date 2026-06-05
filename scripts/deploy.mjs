import { ethers } from "ethers";

const RPC = "https://rpc.testnet.arc.network";
const USDC = "0x3600000000000000000000000000000000000000";
const DEPLOYER_PK = process.env.PRIVATE_KEY || process.argv[2];

if (!DEPLOYER_PK || DEPLOYER_PK === "0xYOUR_PRIVATE_KEY_HERE") {
  console.error("Usage: node scripts/deploy.mjs <private-key>");
  console.error("Or set PRIVATE_KEY environment variable.");
  process.exit(1);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(DEPLOYER_PK, provider);
  const addr = await wallet.getAddress();
  console.log("Deployer:", addr);

  // Compile manually with forge first, then load
  const fs = await import("fs");
  const raw = JSON.parse(fs.readFileSync("out/StableSwapDEX.sol/StableSwapDEX.json", "utf8"));

  const factory = new ethers.ContractFactory(raw.abi, raw.bytecode, wallet);
  console.log("Deploying StableSwapDEX with USDC:", USDC);
  const contract = await factory.deploy(USDC, { gasLimit: 3000000 });
  await contract.waitForDeployment();

  const contractAddr = await contract.getAddress();
  console.log("Deployed at:", contractAddr);

  // Save for frontend
  const info = {
    network: "Arc Testnet",
    chainId: 5042002,
    rpc: RPC,
    usdc: USDC,
    contract: contractAddr,
    abi: raw.abi,
  };
  fs.writeFileSync("frontend/contract-info.json", JSON.stringify(info, null, 2));
  console.log("Saved frontend/contract-info.json");
}

main().catch(e => { console.error(e); process.exit(1); });
