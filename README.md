# ArcStable · Stablecoin FX Router

A concentrated-liquidity stablecoin swap DApp built on **[Arc Network](https://arc.network)**, inspired by Liquira's design and architecture.

**Live Demo:** _(deploy to Vercel)_

---

## Features

### 🔄 Swap
- Swap between 10+ stablecoins (USDC, EURC, KRW1, JPYC, GBPT, BRZ, MXNB, SGDX, NGNX, AEDC)
- Stableswap AMM with concentrated liquidity for tight spreads
- Live pricing with 0.04% fee and configurable slippage tolerance

### 💧 Liquidity Pools
- Provide USDC liquidity to earn swap fees
- Real-time TVL, volume, APR, and utilization data
- Withdraw liquidity anytime

### 📊 Analytics
- Total TVL, 24h volume, average slippage, active pairs
- Per-pool breakdown with trend data

### 🔐 Wallet-First
- Connect MetaMask, OKX Wallet, or any EIP-1193 provider
- All transactions signed locally
- Auto-switches to Arc Testnet

---

## Architecture

```
arc-stable-swap/
├── contracts/
│   └── StableSwapDEX.sol          # Stableswap AMM (concentrated liquidity)
├── frontend/
│   ├── index.html                 # DApp interface (Liquira-inspired)
│   ├── scripts.js                 # Wallet interaction + swap logic
│   └── vercel.json                # Vercel static deployment
├── scripts/
│   └── deploy.mjs                 # Contract deployment script
├── foundry.toml                   # Foundry/Solidity config
├── .env.example
└── README.md
```

### Stableswap Invariant

The AMM uses a modified stableswap invariant optimized for 2-token pools:

```
D^2 * (A*4 - 1) = (x+y) * A*4 * D + (x+y) * D - 4*x*y
```

Where:
- **D** = total pool value in invariant terms
- **A** = amplification coefficient (higher = more concentrated around peg)
- **x, y** = reserves of token0 and token1

This creates a flat price curve near the peg (minimal slippage for stable pairs) while maintaining liquidity across a wide range.

### Smart Contract Functions

| Function | Description |
|----------|-------------|
| `createPool(token1, decimals, A, fee)` | Create a new USDC/token1 pool (owner) |
| `addLiquidity(id, amount0, amount1, minShares)` | Add USDC + token1 at pool ratio |
| `removeLiquidity(id, shares, minAmount0, minAmount1)` | Withdraw LP position |
| `swap(id, tokenIn, amountIn, minAmountOut)` | Execute swap through pool |
| `claimFees(id)` | Claim pending LP fees |
| `getAmountOut(id, tokenIn, amountIn)` | Preview swap output |
| `pendingFees(id, lp)` | View pending LP fees |

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- [Foundry](https://book.getfoundry.sh/) for contract compilation
- A wallet with USDC on Arc Testnet

### Setup

```bash
# Clone
git clone https://github.com/lzmaks10/arc-stable-swap.git
cd arc-stable-swap

# Compile contracts
forge build

# Deploy (set PRIVATE_KEY in .env first)
node scripts/deploy.mjs

# Deploy frontend
cd frontend
vercel --prod
```

### Frontend Only (Mock Mode)

Just open `frontend/index.html` directly or deploy to Vercel. Without a deployed contract, the swap uses simulated pricing based on live FX rates.

---

## Token List

| Symbol | Name | Region |
|--------|------|--------|
| USDC | USD Coin | 🇺🇸 |
| EURC | Euro Coin | 🇪🇺 |
| KRW1 | Korean Won Stable | 🇰🇷 |
| JPYC | JPY Coin | 🇯🇵 |
| GBPT | Poundtoken | 🇬🇧 |
| BRZ | Brazilian Digital Token | 🇧🇷 |
| MXNB | Mexican Peso Stable | 🇲🇽 |
| SGDX | Singapore Dollar Stable | 🇸🇬 |
| NGNX | Naira Stable | 🇳🇬 |
| AEDC | Dirham Coin | 🇦🇪 |

---

## License

MIT
