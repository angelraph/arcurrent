// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * Holds the treasury's USDC on Arc and executes settlements on the agent's
 * instruction. Obligation bookkeeping (vendor, due date, decision reasoning)
 * stays in Supabase — this contract only needs enough on-chain state to make
 * settlement itself a verifiable on-chain action rather than a bare wallet
 * transfer, with `obligationId` (the Supabase row id) carried through so a
 * settlement can always be traced back to the obligation it paid.
 */
contract ObligationEscrow is Ownable {
  using SafeERC20 for IERC20;

  IERC20 public immutable usdc;

  event Deposited(address indexed from, uint256 amount);
  event Settled(string indexed obligationId, address indexed destination, uint256 amount);

  constructor(address usdcAddress, address owner) Ownable(owner) {
    usdc = IERC20(usdcAddress);
  }

  /** Pulls `amount` USDC from the caller into the escrow. Caller must approve first. */
  function deposit(uint256 amount) external {
    usdc.safeTransferFrom(msg.sender, address(this), amount);
    emit Deposited(msg.sender, amount);
  }

  /** Owner-only: pays an obligation out of the escrow's USDC balance. */
  function settle(string calldata obligationId, address destination, uint256 amount) external onlyOwner {
    usdc.safeTransfer(destination, amount);
    emit Settled(obligationId, destination, amount);
  }
}
