// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title StableSwapPair
/// @notice Concentrated-liquidity AMM for swapping between two stablecoins
///         Uses a modified stableswap invariant: D = N * product * A * sum + ...
///         Simplified for 2-token pools (like Curve v2 for stables)
contract StableSwapPair {

    // ─── Errors ───
    error InsufficientLiquidity();
    error InsufficientOutput();
    error SlippageExceeded();
    error InvalidToken();
    error InvalidAmount();
    error NotFactory();
    error AlreadyInitialized();

    // ─── State ───
    address public immutable factory;
    address public immutable token0;
    address public immutable token1;
    uint8   public immutable decimals0;
    uint8   public immutable decimals1;

    uint256 public reserve0;
    uint256 public reserve1;
    uint256 public liquidityTotal; // total LP shares

    // LP shares per address
    mapping(address => uint256) public balanceOf;

    // Fee parameters
    uint256 public swapFee;        // in basis points (e.g. 4 = 0.04%)
    uint256 public adminFee;       // share of fees sent to admin (in BPS, e.g. 5000 = 50%)
    address public feeTo;

    uint256 public kLast; // for fee-on-transfer calculation (optional)

    // Amplification coefficient (A * N^(N-1))
    // For 2 coins, N=2, so A = amplification * N^(N-1) = amplification * 2
    uint256 public A;              // amplification constant * 2

    // ─── Events ───
    event Mint(address indexed sender, uint256 amount0, uint256 amount1, uint256 liquidity);
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, uint256 liquidity);
    event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to);
    event Sync(uint112 reserve0, uint112 reserve1);

    // ─── Modifiers ───
    modifier onlyFactory() { if (msg.sender != factory) revert NotFactory(); _; }

    // ─── Constructor ───
    constructor() {
        factory = msg.sender;
        (token0, token1) = (address(0), address(0)); // placeholder
        (decimals0, decimals1) = (0, 0);
    }

    // ─── Initialize (called by factory) ───
    function initialize(address _token0, address _token1, uint8 _d0, uint8 _d1, uint256 _A, uint256 _fee) external onlyFactory {
        if (token0 != address(0)) revert AlreadyInitialized();
        // Use SSTORE via assembly to write immutables... but for simplicity, use storage
        // Actually immutables can't be reassigned. Let me use this pattern differently.
        // We'll store them as storage vars instead.
    }
}

// Actually, let me refactor to make this work properly with Foundry.
// The issue is that immutable variables can't be set in an initializer.
// For a factory pattern, we need to use storage or clones.
