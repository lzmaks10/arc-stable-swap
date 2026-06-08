import { ethers } from "ethers";

const RPC = "https://rpc.testnet.arc.network";
const EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
const USER = "0xb112A6635c2974338F8657606E5d59BF312C1241";

const p = new ethers.JsonRpcProvider(RPC);
const c = new ethers.Contract(EURC, ["function balanceOf(address) view returns (uint256)"], p);
c.balanceOf(USER).then(b => console.log("EURC balance:", ethers.formatUnits(b, 6)));
