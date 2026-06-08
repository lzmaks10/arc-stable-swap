// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title LPToken — ERC20 LP Token for StableSwapDEX pools
/// @notice Each pool gets its own LPToken: minted on addLiquidity, burned on removeLiquidity.
///         Only the StableSwapDEX contract (deployer) can mint/burn.
contract LPToken {

    string  public name;
    string  public symbol;
    uint8   public constant decimals = 6;
    uint256 public totalSupply;
    address public immutable dex;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error NotDex();
    error ZeroAddress();

    modifier onlyDex() { if (msg.sender != dex) revert NotDex(); _; }

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
        dex = msg.sender;
    }

    function mint(address to, uint256 amount) external onlyDex {
        if (to == address(0)) revert ZeroAddress();
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount) external onlyDex {
        if (amount == 0) return;
        uint256 bal = balanceOf[from];
        if (bal < amount) amount = bal;
        totalSupply -= amount;
        balanceOf[from] = bal - amount;
        emit Transfer(from, address(0), amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        return _transfer(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        return _transfer(from, to, amount);
    }

    function _transfer(address from, address to, uint256 amount) internal returns (bool) {
        if (to == address(0)) revert ZeroAddress();
        uint256 bal = balanceOf[from];
        if (bal < amount) amount = bal;
        balanceOf[from] = bal - amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}
