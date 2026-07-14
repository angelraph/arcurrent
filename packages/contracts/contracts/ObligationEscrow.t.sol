// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ObligationEscrow } from "./ObligationEscrow.sol";
import { MockUSDC } from "./test/MockUSDC.sol";

contract ObligationEscrowTest is Test {
  ObligationEscrow escrow;
  MockUSDC usdc;

  address owner = address(0x0A);
  address depositor = address(0x0B);
  address vendor = address(0x0C);
  address stranger = address(0x0D);

  function setUp() public {
    usdc = new MockUSDC();
    escrow = new ObligationEscrow(address(usdc), owner);

    usdc.mint(depositor, 1_000e6);
    vm.prank(depositor);
    usdc.approve(address(escrow), type(uint256).max);
  }

  function test_DepositIncreasesEscrowBalance() public {
    vm.prank(depositor);
    escrow.deposit(100e6);
    assertEq(usdc.balanceOf(address(escrow)), 100e6);
  }

  function test_OwnerCanSettleToDestination() public {
    vm.prank(depositor);
    escrow.deposit(100e6);

    vm.prank(owner);
    escrow.settle("obligation-1", vendor, 40e6);

    assertEq(usdc.balanceOf(vendor), 40e6);
    assertEq(usdc.balanceOf(address(escrow)), 60e6);
  }

  function test_SettleRevertsForNonOwner() public {
    vm.prank(depositor);
    escrow.deposit(100e6);

    vm.prank(stranger);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
    escrow.settle("obligation-1", vendor, 40e6);
  }

  function test_SettleRevertsWithInsufficientBalance() public {
    vm.prank(depositor);
    escrow.deposit(10e6);

    vm.prank(owner);
    vm.expectRevert();
    escrow.settle("obligation-1", vendor, 40e6);
  }
}
