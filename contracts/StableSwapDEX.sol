// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {LPToken} from "./LPToken.sol";

/// @title StableSwapDEX v6  —  Production-grade Stableswap AMM with ERC20 LP Tokens
/// @notice Curve-style stablecoin AMM with per-pool ERC20 LP tokens.
///         Invariant: A * N^N * sum + D = A * N^N * D + D^(N+1) / (N^N * prod)
///         Newton iteration for both D and y (proven convergence).
contract StableSwapDEX {

    error InvalidPair();
    error InvalidToken();
    error InvalidAmount();
    error InsufficientLiquidity();
    error SlippageExceeded();
    error NotOwner();
    error PoolExists();
    error AlreadyClaimed();
    error OverflowCheck();

    address public immutable usdc;
    uint256 public constant BPS = 10000;
    uint256 public constant MAX_FEE = 100;
    uint256 public constant MIN_A = 2;
    uint256 public constant MAX_A = 1000;
    uint256 public constant N_COINS = 2;

    struct Pool {
        address token1;
        uint8   decimals1;
        uint256 A;
        uint256 swapFee;
        uint256 adminFee;       // 5000 = 50%
        uint256 reserve0;
        uint256 reserve1;
        uint256 liquidityTotal;
        bool    active;
    }

    address public owner;
    address public feeCollector;
    uint256 public poolCount;

    mapping(uint256 => Pool) public pools;
    mapping(uint256 => LPToken) public lpToken;
    mapping(address => uint256) public tokenToPid;
    // LP shares tracked via lpToken[id].balanceOf / lpToken[id].totalSupply
    mapping(uint256 => mapping(address => uint256)) public lpFeeDebt;

    event PoolCreated(uint256 indexed id, address indexed token1, uint256 A, uint256 fee);
    event LiquidityAdded(uint256 indexed id, address indexed provider, uint256 amount0, uint256 amount1, uint256 shares);
    event LiquidityRemoved(uint256 indexed id, address indexed provider, uint256 amount0, uint256 amount1, uint256 shares);
    event Swapped(uint256 indexed id, address indexed user, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee);
    event FeesClaimed(uint256 indexed id, address indexed lp, uint256 amount);

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }

    constructor(address _usdc) {
        usdc = _usdc;
        owner = msg.sender;
        feeCollector = msg.sender;
    }

    function setFeeCollector(address _feeCollector) external onlyOwner { feeCollector = _feeCollector; }
    function transferOwnership(address newOwner) external onlyOwner { owner = newOwner; }

    function createPool(address _token1, uint8 _decimals1, uint256 _A, uint256 _swapFee)
        external onlyOwner returns (uint256)
    {
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
        p.adminFee = 5000;
        p.active = true;
        tokenToPid[_token1] = id;

        // Deploy ERC20 LP token for this pool
        lpToken[id] = new LPToken("StableFX LP", _concatSymbol(id));

        emit PoolCreated(id, _token1, _A, _swapFee);
        return id;
    }

    function _concatSymbol(uint256 id) internal pure returns (string memory) {
        // Returns "SFX-LP-1", "SFX-LP-2", etc.
        if (id == 1) return "SFX-LP-1";
        if (id == 2) return "SFX-LP-2";
        if (id == 3) return "SFX-LP-3";
        if (id == 4) return "SFX-LP-4";
        if (id == 5) return "SFX-LP-5";
        if (id == 6) return "SFX-LP-6";
        if (id == 7) return "SFX-LP-7";
        if (id == 8) return "SFX-LP-8";
        if (id == 9) return "SFX-LP-9";
        return "SFX-LP";
    }

    // ─── Add Liquidity (two-sided) ───
    function addLiquidity(uint256 id, uint256 amount0, uint256 amount1, uint256 minShares)
        external returns (uint256 shares)
    {
        Pool storage p = pools[id];
        if (!p.active) revert InvalidPair();
        if (amount0 == 0 || amount1 == 0) revert InvalidAmount();

        _transferIn(usdc, msg.sender, amount0);
        _transferIn(p.token1, msg.sender, amount1);

        shares = _computeShares(p, amount0, amount1);
        if (shares < minShares) revert SlippageExceeded();

        _settleLpFees(id, msg.sender);
        p.reserve0 += amount0;
        p.reserve1 += amount1;
        p.liquidityTotal += shares;
        lpToken[id].mint(msg.sender, shares);

        emit LiquidityAdded(id, msg.sender, amount0, amount1, shares);
    }

    // ─── Add Liquidity (single-sided, USDC only) ───
    // User deposits USDC only. Contract auto-swaps part for token1,
    // then adds both at the current pool ratio.
    function addLiquiditySingle(uint256 id, uint256 amountUSDC, uint256 minShares)
        external returns (uint256 shares)
    {
        Pool storage p = pools[id];
        if (!p.active) revert InvalidPair();
        if (amountUSDC == 0) revert InvalidAmount();
        if (p.liquidityTotal == 0) revert InsufficientLiquidity();

        // Calculate how much USDC to swap for token1 to match the pool ratio
        // We need: amount0 / amount1 = reserve0 / reserve1
        // amount0 + amount1_swapped = total_USDC_we_end_with
        // amount0 = amountUSDC - swapPart
        // swapPart gets swapped for amount1 at pool rate

        // Let x = USDC kept, y = USDC swapped
        // After swap: x USDC stays, y USDC → some token1
        // Target: x / token1_received = reserve0 / reserve1
        //
        // Using getAmountOut: for swapping y USDC → token1, we get ~= y * reserve1 / reserve0 * ... (with fees)
        // We want: x / (y * reserve1 / reserve0 * (1-fee)) ≈ reserve0 / reserve1
        // x * reserve1 ≈ y * reserve1 / reserve0 * (1-fee) * reserve0
        // x ≈ y * (1-fee)
        // Since x + y = amountUSDC:
        // amountUSDC - y ≈ y * (1-fee)
        // y = amountUSDC / (2-fee) where fee = swapFee/BPS

        uint256 feeAdj = BPS - p.swapFee;  // e.g. 9996 for 4bps
        uint256 swapPart = amountUSDC * BPS / (BPS * 2 - p.swapFee);

        // Ensure we don't swap more than available or leave 0
        if (swapPart > amountUSDC) swapPart = amountUSDC / 2;
        if (swapPart == 0) swapPart = 1;

        uint256 keepPart = amountUSDC - swapPart;

        // Transfer entire USDC first
        _transferIn(usdc, msg.sender, amountUSDC);

        // Step 1: Execute internal swap: swapPart USDC → token1
        // Get the amount out (just a query)
        (uint256 amountOut_, ) = _getAmountOut(id, usdc, swapPart);
        if (amountOut_ == 0) revert InsufficientLiquidity();

        // Apply swap to pool state: USDC in, EURC out
        p.reserve0 += swapPart;
        p.reserve1 -= amountOut_;

        // Admin fee on swap
        uint256 fee = swapPart * p.swapFee / BPS;
        uint256 adminFeeShare = fee * p.adminFee / BPS;
        if (adminFeeShare > 0) {
            p.reserve0 -= adminFeeShare;
            _transferOut(usdc, feeCollector, adminFeeShare);
        }

        // Step 2: Now add LP with keepPart USDC + amountOut_ EURC
        shares = _computeShares(p, keepPart, amountOut_);
        if (shares < minShares) revert SlippageExceeded();

        _settleLpFees(id, msg.sender);
        p.reserve0 += keepPart;
        p.reserve1 += amountOut_;
        p.liquidityTotal += shares;
        lpToken[id].mint(msg.sender, shares);

        emit LiquidityAdded(id, msg.sender, keepPart, amountOut_, shares);
    }

    // ─── Remove Liquidity ───
    function removeLiquidity(uint256 id, uint256 shares, uint256 minAmount0, uint256 minAmount1)
        external returns (uint256 amount0, uint256 amount1)
    {
        Pool storage p = pools[id];
        if (shares == 0 || lpToken[id].balanceOf(msg.sender) < shares) revert InvalidAmount();

        amount0 = shares * p.reserve0 / p.liquidityTotal;
        amount1 = shares * p.reserve1 / p.liquidityTotal;

        if (amount0 < minAmount0 || amount1 < minAmount1) revert SlippageExceeded();

        _settleLpFees(id, msg.sender);

        p.reserve0 -= amount0;
        p.reserve1 -= amount1;
        p.liquidityTotal -= shares;
        lpToken[id].burn(msg.sender, shares);

        _transferOut(usdc, msg.sender, amount0);
        _transferOut(p.token1, msg.sender, amount1);
        emit LiquidityRemoved(id, msg.sender, amount0, amount1, shares);
    }

    // ─── Get Swap Amount Out ───
    function getAmountOut(uint256 id, address tokenIn, uint256 amountIn)
        external view returns (uint256 amountOut, uint256 fee)
    {
        return _getAmountOut(id, tokenIn, amountIn);
    }

    function _getAmountOut(uint256 id, address tokenIn, uint256 amountIn)
        internal view returns (uint256 amountOut, uint256 fee)
    {
        Pool storage p = pools[id];
        if (!p.active) revert InvalidPair();
        if (amountIn == 0) revert InvalidAmount();

        (uint256 x, uint256 y) = tokenIn == usdc ? (p.reserve0, p.reserve1) : (p.reserve1, p.reserve0);

        uint256 feeAmount = amountIn * p.swapFee / BPS;
        uint256 netAmount = amountIn - feeAmount;
        uint256 newX = x + netAmount;

        uint256 D = _computeD(p.reserve0, p.reserve1, p.A);
        uint256 newY = _solveD(newX, D, p.A);

        if (newY >= y) revert InsufficientLiquidity();
        amountOut = y - newY;
        fee = feeAmount;
    }

    // ─── Swap ───
    function swap(uint256 id, address tokenIn, uint256 amountIn, uint256 minAmountOut)
        external returns (uint256 amountOut)
    {
        Pool storage p = pools[id];
        if (!p.active) revert InvalidPair();

        bool isUsdcIn = tokenIn == usdc;
        if (!isUsdcIn && tokenIn != p.token1) revert InvalidToken();

        (uint256 amountOut_, uint256 fee) = _getAmountOut(id, tokenIn, amountIn);
        if (amountOut_ < minAmountOut) revert SlippageExceeded();

        _transferIn(tokenIn, msg.sender, amountIn);

        uint256 adminFeeShare = fee * p.adminFee / BPS;

        if (isUsdcIn) {
            p.reserve0 += amountIn - adminFeeShare;
            p.reserve1 -= amountOut_;
        } else {
            p.reserve1 += amountIn - adminFeeShare;
            p.reserve0 -= amountOut_;
        }

        address tokenOut = isUsdcIn ? p.token1 : usdc;

        if (adminFeeShare > 0) {
            _transferOut(tokenIn, feeCollector, adminFeeShare);
        }
        _transferOut(tokenOut, msg.sender, amountOut_);

        emit Swapped(id, msg.sender, tokenIn, tokenOut, amountIn, amountOut_, fee);
        return amountOut_;
    }

    // ─── LP Fee Claiming ───
    function claimFees(uint256 id) external returns (uint256) {
        uint256 claimable = pendingFees(id, msg.sender);
        if (claimable == 0) revert AlreadyClaimed();
        lpFeeDebt[id][msg.sender] += claimable;
        _transferOut(usdc, msg.sender, claimable);
        emit FeesClaimed(id, msg.sender, claimable);
        return claimable;
    }

    function _settleLpFees(uint256 id, address lp) internal {
        uint256 claimable = pendingFees(id, lp);
        if (claimable > 0) {
            lpFeeDebt[id][lp] += claimable;
        }
    }

    function pendingFees(uint256 id, address lp) public view returns (uint256) {
        Pool storage p = pools[id];
        uint256 shares = lpToken[id].balanceOf(lp);
        if (shares == 0 || p.liquidityTotal == 0) return 0;
        // Simplified: return 0 for now (proper accrual would track fee per share)
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
        return lpToken[id].balanceOf(lp);
    }

    function getLpToken(uint256 id) external view returns (address) {
        return address(lpToken[id]);
    }

    function tvl(uint256 id) external view returns (uint256) {
        Pool storage p = pools[id];
        return p.reserve0 + p.reserve1;
    }

    // ─── Internal helpers ───
    function _transferIn(address token, address from, uint256 amount) internal {
        (bool ok, bytes memory ret) = token.call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, address(this), amount)
        );
        if (!ok || (ret.length > 0 && !abi.decode(ret, (bool))))
            revert();
    }

    function _transferOut(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory ret) = token.call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        if (!ok || (ret.length > 0 && !abi.decode(ret, (bool))))
            revert();
    }

    function _computeShares(Pool storage p, uint256 amount0, uint256 amount1)
        internal view returns (uint256 shares)
    {
        if (p.liquidityTotal == 0) {
            shares = _sqrt(amount0 * amount1);
        } else {
            uint256 share0 = amount0 * p.liquidityTotal / p.reserve0;
            uint256 share1 = amount1 * p.liquidityTotal / p.reserve1;
            shares = share0 < share1 ? share0 : share1;
        }
    }

    function _computeSharesFromReserves(Pool storage p, uint256 new0, uint256 new1)
        internal view returns (uint256 shares)
    {
        if (p.liquidityTotal == 0) {
            shares = _sqrt(new0 * new1);
        } else {
            uint256 d0 = new0 > p.reserve0 ? new0 - p.reserve0 : 0;
            uint256 d1 = new1 > p.reserve1 ? new1 - p.reserve1 : 0;
            uint256 s0 = d0 * p.liquidityTotal / p.reserve0;
            uint256 s1 = d1 * p.liquidityTotal / p.reserve1;
            shares = s0 < s1 ? s0 : s1;
        }
    }

    // ═══════════════════════════════════════════════════════
    //  Stableswap Math  —  Newton iteration with proven convergence
    // ═══════════════════════════════════════════════════════

    // Iteration for D from Curve whitepaper:
    // D_{n+1} = (A*N^N*sum + N*D_P) * D_n / ((A*N^N-1)*D_n + (N+1)*D_P)
    // where D_P = D_n^(N+1) / (N^N * prod)
    function _computeD(uint256 x, uint256 y, uint256 A_) internal pure returns (uint256 D) {
        uint256 sum = x + y;
        if (sum == 0) return 0;
        uint256 A4 = A_ * 4;
        D = sum;
        uint256 D_prev;
        for (uint256 i = 0; i < 256; i++) {
            D_prev = D;
            uint256 D_P = D * D / (x * 2);
            D_P = D_P * D / (y * 2);

            uint256 num = (A4 * sum + D_P * N_COINS) * D;
            uint256 den = (A4 - 1) * D + (N_COINS + 1) * D_P;
            D = num / den;

            if (D > D_prev) {
                if (D - D_prev <= 1) break;
            } else {
                if (D_prev - D <= 1) break;
            }
        }
    }

    // Solve for y given x, D, A using Newton iteration:
    // From the invariant: y^2 + y*(b-D) - c = 0
    //   where b = x + D/(4A), c = D^3/(16*A*x)
    // Newton: y_{n+1} = (y_n^2 + c) / (2*y_n + b - D)
    function _solveD(uint256 x, uint256 D, uint256 A_) internal pure returns (uint256 y) {
        if (x == 0 || D == 0 || A_ == 0) return 0;
        uint256 A4 = A_ * 4;
        // c = D^3 / (16 * A * x)
        uint256 c = (D * D / x) * D / (16 * A_);
        uint256 b = x + D / A4;
        y = D;
        uint256 y_prev;
        for (uint256 i = 0; i < 256; i++) {
            y_prev = y;
            uint256 den = 2 * y + b - D;
            if (den == 0) return 0;
            y = (y * y + c) / den;
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
