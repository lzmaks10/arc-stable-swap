// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title StableSwapDEX
/// @notice Concentrated-liquidity AMM for stablecoin pairs on Arc Network.
///         Uses the stableswap invariant (like Curve) for tight spreads.
///         Single contract manages all pairs internally.
///
/// Invariant: D = A * N^N * sum(x_i) + (A * N^N - 1) * D * N^N / (prod(x_i) * N^N)
/// Simplified for 2-coin pools: D^2 * (A*4 - 1) = (x+y) * A*4 * D + (x+y) * D - 4*x*y
/// Where A = amplification parameter (higher = more concentrated around peg)
contract StableSwapDEX {

    // ─── Errors ───
    error InvalidPair();
    error InvalidToken();
    error InvalidAmount();
    error InsufficientLiquidity();
    error InsufficientOutput();
    error SlippageExceeded();
    error NotOwner();
    error PoolExists();
    error AlreadyClaimed();

    // ─── Constants ───
    address public immutable usdc;                 // USDC (native gas token on Arc)
    uint256 public constant BPS = 10000;
    uint256 public constant MAX_FEE = 100;         // max 1% fee (100 bps)
    uint256 public constant MIN_A = 2;             // minimum amplification
    uint256 public constant MAX_A = 1000;          // maximum amplification
    uint256 public constant N_COINS = 2;           // 2-token pools

    // ─── Pool State ───
    struct Pool {
        address token1;       // token0 is always USDC
        uint8 decimals1;      // decimals of token1
        uint256 A;            // amplification coefficient (scaled by A_PRECISION)
        uint256 swapFee;      // fee in BPS (e.g. 4 = 0.04%)
        uint256 adminFee;     // share of swap fee to admin (in BPS, 5000 = 50%)
        uint256 reserve0;     // USDC reserve
        uint256 reserve1;     // token1 reserve
        uint256 liquidityTotal; // total LP shares
        bool active;
    }

    // ─── State ───
    address public owner;
    address public feeCollector;
    uint256 public poolCount;

    mapping(uint256 => Pool) public pools;
    mapping(address => uint256) public tokenToPid;  // token1 address → pool id

    // LP shares per address per pool
    mapping(uint256 => mapping(address => uint256)) public lpShares;
    // Fee debt per LP per pool (how much fee they've already withdrawn)
    mapping(uint256 => mapping(address => uint256)) public lpFeeDebt;

    // ─── Events ───
    event PoolCreated(uint256 indexed id, address indexed token1, uint256 A, uint256 fee);
    event LiquidityAdded(uint256 indexed id, address indexed provider, uint256 amount0, uint256 amount1, uint256 shares);
    event LiquidityRemoved(uint256 indexed id, address indexed provider, uint256 amount0, uint256 amount1, uint256 shares);
    event Swapped(uint256 indexed id, address indexed user, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee);
    event FeesClaimed(uint256 indexed id, address indexed lp, uint256 amount);

    // ─── Modifier ───
    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }

    // ─── Constructor ───
    constructor(address _usdc) {
        usdc = _usdc;
        owner = msg.sender;
        feeCollector = msg.sender;
    }

    // ─── Admin ───
    function setFeeCollector(address _feeCollector) external onlyOwner {
        feeCollector = _feeCollector;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    // ─── Create Pool ───
    function createPool(
        address _token1,
        uint8 _decimals1,
        uint256 _A,
        uint256 _swapFee
    ) external onlyOwner returns (uint256) {
        if (_token1 == address(0) || _token1 == usdc) revert InvalidToken();
        if (tokenToPid[_token1] != 0) revert PoolExists();
        if (_A < MIN_A || _A > MAX_A) revert InvalidAmount();
        if (_swapFee > MAX_FEE) revert InvalidAmount();

        uint256 id = ++poolCount;
        Pool storage p = pools[id];
        p.token1 = _token1;
        p.decimals1 = _decimals1;
        p.A = _A;
        p.swapFee = _swapFee;
        p.adminFee = 5000; // 50% of fees to treasury by default
        p.active = true;

        tokenToPid[_token1] = id;

        emit PoolCreated(id, _token1, _A, _swapFee);
        return id;
    }

    // ─── Add Liquidity ───
    // User provides USDC + token1 at current ratio
    function addLiquidity(uint256 id, uint256 amount0, uint256 amount1, uint256 minShares) external returns (uint256 shares) {
        Pool storage p = pools[id];
        if (!p.active) revert InvalidPair();
        if (amount0 == 0 || amount1 == 0) revert InvalidAmount();

        IERC20(usdc).transferFrom(msg.sender, address(this), amount0);
        IERC20(p.token1).transferFrom(msg.sender, address(this), amount1);

        if (p.liquidityTotal == 0) {
            // First deposit: shares = geometric mean of amounts
            shares = _sqrt(amount0 * amount1);
        } else {
            // Subsequent deposits: proportional to pool share
            uint256 share0 = amount0 * p.liquidityTotal / p.reserve0;
            uint256 share1 = amount1 * p.liquidityTotal / p.reserve1;
            shares = share0 < share1 ? share0 : share1;
        }

        if (shares < minShares) revert SlippageExceeded();

        // Settle LP fee debt before updating
        _settleLpFees(id, msg.sender);

        p.reserve0 += amount0;
        p.reserve1 += amount1;
        p.liquidityTotal += shares;
        lpShares[id][msg.sender] += shares;

        emit LiquidityAdded(id, msg.sender, amount0, amount1, shares);
    }

    // ─── Remove Liquidity ───
    function removeLiquidity(uint256 id, uint256 shares, uint256 minAmount0, uint256 minAmount1) external returns (uint256 amount0, uint256 amount1) {
        Pool storage p = pools[id];
        if (shares == 0 || lpShares[id][msg.sender] < shares) revert InvalidAmount();

        amount0 = shares * p.reserve0 / p.liquidityTotal;
        amount1 = shares * p.reserve1 / p.liquidityTotal;

        if (amount0 < minAmount0 || amount1 < minAmount1) revert SlippageExceeded();

        // Settle LP fees first
        _settleLpFees(id, msg.sender);

        p.reserve0 -= amount0;
        p.reserve1 -= amount1;
        p.liquidityTotal -= shares;
        lpShares[id][msg.sender] -= shares;

        IERC20(usdc).transfer(msg.sender, amount0);
        IERC20(p.token1).transfer(msg.sender, amount1);

        emit LiquidityRemoved(id, msg.sender, amount0, amount1, shares);
    }

    // ─── Get Swap Amount Out ───
    // Uses the stableswap invariant to compute output
    // D = total pool value in invariant terms
    // y = new reserve of tokenOut after swap
    // x = new reserve of tokenIn after swap
    function getAmountOut(uint256 id, address tokenIn, uint256 amountIn) public view returns (uint256 amountOut, uint256 fee) {
        Pool storage p = pools[id];
        if (!p.active) revert InvalidPair();
        if (amountIn == 0) revert InvalidAmount();

        (uint256 x, uint256 y) = tokenIn == usdc ? (p.reserve0, p.reserve1) : (p.reserve1, p.reserve0);

        uint256 feeAmount = amountIn * p.swapFee / BPS;
        uint256 netAmount = amountIn - feeAmount;

        // D invariant
        uint256 D = _computeD(p.reserve0, p.reserve1, p.A);

        // New x after adding input
        uint256 newX = x + netAmount;

        // New y = solve for y given D and newX
        uint256 newY = _solveD(newX, D, p.A);

        if (newY >= y) revert InsufficientLiquidity();
        amountOut = y - newY;
        fee = feeAmount;
    }

    // ─── Swap ───
    function swap(uint256 id, address tokenIn, uint256 amountIn, uint256 minAmountOut) external returns (uint256 amountOut) {
        Pool storage p = pools[id];
        if (!p.active) revert InvalidPair();

        // Determine direction
        bool isUsdcIn = tokenIn == usdc;
        if (!isUsdcIn && tokenIn != p.token1) revert InvalidToken();

        (uint256 amountOut_, uint256 fee) = getAmountOut(id, tokenIn, amountIn);
        if (amountOut_ < minAmountOut) revert SlippageExceeded();

        // Transfer input token
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);

        // Calculate admin fee share
        uint256 adminFeeShare = fee * p.adminFee / BPS;
        uint256 lpFeeShare = fee - adminFeeShare;

        // Update reserves
        if (isUsdcIn) {
            p.reserve0 += amountIn - adminFeeShare; // admin fee taken out
            p.reserve1 -= amountOut_;
        } else {
            p.reserve1 += amountIn - adminFeeShare;
            p.reserve0 -= amountOut_;
        }

        address tokenOut = isUsdcIn ? p.token1 : usdc;

        // Send admin fee to fee collector
        if (adminFeeShare > 0) {
            IERC20(tokenIn).transfer(feeCollector, adminFeeShare);
        }

        // Output goes to user
        IERC20(tokenOut).transfer(msg.sender, amountOut_);

        emit Swapped(id, msg.sender, tokenIn, tokenOut, amountIn, amountOut_, fee);
        return amountOut_;
    }

    // ─── Claim LP Fees ───
    function claimFees(uint256 id) external returns (uint256) {
        uint256 claimable = pendingFees(id, msg.sender);
        if (claimable == 0) revert AlreadyClaimed();

        lpFeeDebt[id][msg.sender] += claimable;
        IERC20(usdc).transfer(msg.sender, claimable);
        emit FeesClaimed(id, msg.sender, claimable);
        return claimable;
    }

    // ─── Settle LP fees internally ───
    function _settleLpFees(uint256 id, address lp) internal {
        uint256 claimable = pendingFees(id, lp);
        if (claimable > 0) {
            lpFeeDebt[id][lp] += claimable;
        }
    }

    // ─── Pending LP fees (view) ───
    function pendingFees(uint256 id, address lp) public view returns (uint256) {
        Pool storage p = pools[id];
        uint256 shares = lpShares[id][lp];
        if (shares == 0 || p.liquidityTotal == 0) return 0;

        // Total LP fees = sum of (swap fees * (1 - adminFee/BPS)) for all swaps
        // We track total accrued LP fees as (totalPoolEstimate - reserves)
        // Since fees stay in the pool, the LP's share is proportional

        // Simplified: total LP fees = (liquidityTotal growth from fees)
        // For a proper implementation, we'd track fee accumulation per share.
        // For this MVP, we use the unrealized gain approach:
        uint256 totalFees = _getAccruedFees(id);
        uint256 entitled = totalFees * shares / p.liquidityTotal;
        uint256 withdrawn = lpFeeDebt[id][lp];
        return entitled > withdrawn ? entitled - withdrawn : 0;
    }

    // ─── Total accrued fees (view) ───
    function _getAccruedFees(uint256 id) internal view returns (uint256) {
        // Estimate accrued fees as the excess USDC value over the initial LP deposits
        // This is a simplified approach. In production, track fee accumulation explicitly.
        Pool storage p = pools[id];
        if (p.liquidityTotal == 0) return 0;
        // Rough estimate: fee pool = (reserve0 + reserve1) - initial deposits
        // We'd need to know initial deposits exactly. For now, return 0 for view accuracy.
        return 0;
    }

    // ─── Getters ───
    function getPool(uint256 id) external view returns (
        address token1, uint8 decimals1, uint256 A, uint256 swapFee,
        uint256 reserve0, uint256 reserve1, uint256 liquidityTotal, bool active
    ) {
        Pool storage p = pools[id];
        return (p.token1, p.decimals1, p.A, p.swapFee, p.reserve0, p.reserve1, p.liquidityTotal, p.active);
    }

    function getLpShares(uint256 id, address lp) external view returns (uint256) {
        return lpShares[id][lp];
    }

    // ─── Pool Value (USD estimate) ───
    function tvl(uint256 id) external view returns (uint256) {
        Pool storage p = pools[id];
        return p.reserve0 + p.reserve1; // simplified, assumes token1 ≈ 1 USDC
    }

    // ═══════════════════════════════════════════════════════
    //  Stableswap Math
    // ═══════════════════════════════════════════════════════

    // D = total deposit in invariant terms
    // A = amplification coefficient
    // For N=2: D^2 * (A*4 - 1) = (x+y) * A*4 * D + (x+y) * D - 4*x*y
    // Simplified Newton iteration to find D

    function _computeD(uint256 x, uint256 y, uint256 A_) internal pure returns (uint256 D) {
        uint256 sum = x + y;
        if (sum == 0) return 0;

        uint256 prod = x * y;
        uint256 A_times_4 = A_ * 4;

        // Initial guess: D = sum
        D = sum;
        uint256 D_prev;

        for (uint256 i = 0; i < 256; i++) {
            D_prev = D;
            // D = (A*4*sum + 2*prod) / (A*4 - 1 + 2*D) ... simplified newton
            // For 2 coins: D = (A*N^N * sum + N * prod / D) / (A*N^N - 1 + N)
            // where N=2: D = (A*4 * sum + 2 * prod / D) / (A*4 - 1 + 2)
            uint256 numerator = A_times_4 * sum + 2 * prod / D;
            uint256 denominator = A_times_4 - 1 + 2;
            D = numerator / denominator;

            if (D > D_prev) {
                if (D - D_prev <= 1) break;
            } else {
                if (D_prev - D <= 1) break;
            }
        }
    }

    // Solve for y given x and D:
    // y = (D^2 / (A*4*x + D - x)) - ... simplified
    function _solveD(uint256 x, uint256 D, uint256 A_) internal pure returns (uint256 y) {
        uint256 A_times_4 = A_ * 4;
        // y = D - x + (D^2) / (A*4*x + D) - D/(A*4 - 1 + 2)
        // Actually, using the Newton method for y:
        // D^2 * (A*4 - 1) = (x+y) * A*4 * D + (x+y) * D - 4*x*y
        // Rearranged as quadratic in y:
        // y^2 * (A*4 - 1) + y * (x*(A*4 - 1) - D*(A*4 + 1)) + (x*D*(A*4 + 1) - D^2*(A*4 - 1) - 4*x*D) = 0
        // Too complex to solve directly. Use Newton iteration:
        y = D; // Initial guess

        uint256 D2 = D * D;
        uint256 c = D2 * (A_times_4 - 1) / (A_times_4 + 1);
        c = c + 2 * x * D;

        uint256 y_prev;
        for (uint256 i = 0; i < 256; i++) {
            y_prev = y;
            uint256 y2 = y * y;
            // f(y) = y^2 + y * (x - D + c/y) - c
            // y_new = (c + 2*x*y - D*y) / (2*y + A_times_4*x / D) ... simplified newton

            uint256 numerator = c + 2 * x * y - D * y;
            uint256 denominator = 2 * y + A_times_4 * x / D;
            if (denominator == 0) break;
            y = numerator / denominator;

            if (y > y_prev) {
                if (y - y_prev <= 1) break;
            } else {
                if (y_prev - y <= 1) break;
            }
        }
    }

    function _sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }
}

interface IERC20 {
    function transferFrom(address, address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
    function decimals() external view returns (uint8);
}
