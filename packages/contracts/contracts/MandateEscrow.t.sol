// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { MandateEscrow } from "./MandateEscrow.sol";
import { MockUSDC } from "./test/MockUSDC.sol";

contract MandateEscrowTest is Test {
  MandateEscrow escrow;
  MockUSDC usdc;

  address funder = address(0x0A);
  address fulfiller = address(0x0B);
  address stranger = address(0x0C);
  address feeRecipient = address(0x0D);

  function setUp() public {
    usdc = new MockUSDC();
    escrow = new MandateEscrow(address(usdc));

    usdc.mint(funder, 1_000e6);
    vm.prank(funder);
    usdc.approve(address(escrow), type(uint256).max);
  }

  function test_CreateMandatePullsFundsAndStoresState() public {
    vm.prank(funder);
    uint256 id = escrow.createMandate(fulfiller, 100e6, 0);

    assertEq(usdc.balanceOf(address(escrow)), 100e6);
    (address f, address ff, uint256 amount, uint256 deadline, , MandateEscrow.Status status) =
      escrow.mandates(id);
    assertEq(f, funder);
    assertEq(ff, fulfiller);
    assertEq(amount, 100e6);
    assertEq(deadline, 0);
    assertEq(uint8(status), uint8(MandateEscrow.Status.Funded));
  }

  function test_CreateMandateRevertsForZeroAmount() public {
    vm.prank(funder);
    vm.expectRevert(bytes("amount must be > 0"));
    escrow.createMandate(fulfiller, 0, 0);
  }

  function test_DesignatedFulfillerCanSubmitProof() public {
    vm.prank(funder);
    uint256 id = escrow.createMandate(fulfiller, 100e6, 0);

    vm.prank(fulfiller);
    escrow.submitProof(id, keccak256("proof"));

    (, , , , bytes32 proofHash, MandateEscrow.Status status) = escrow.mandates(id);
    assertEq(proofHash, keccak256("proof"));
    assertEq(uint8(status), uint8(MandateEscrow.Status.Fulfilled));
  }

  function test_SubmitProofRevertsForWrongFulfiller() public {
    vm.prank(funder);
    uint256 id = escrow.createMandate(fulfiller, 100e6, 0);

    vm.prank(stranger);
    vm.expectRevert(bytes("not the designated fulfiller"));
    escrow.submitProof(id, keccak256("proof"));
  }

  function test_OpenMandateAssignsFirstSubmitterAsFulfiller() public {
    vm.prank(funder);
    uint256 id = escrow.createMandate(address(0), 100e6, 0);

    vm.prank(stranger);
    escrow.submitProof(id, keccak256("proof"));

    (, address ff, , , , ) = escrow.mandates(id);
    assertEq(ff, stranger);
  }

  function test_ReleaseSplitsAtomicallyAndUpdatesReputation() public {
    vm.prank(funder);
    uint256 id = escrow.createMandate(fulfiller, 100e6, 0);

    vm.prank(fulfiller);
    escrow.submitProof(id, keccak256("proof"));

    address[] memory destinations = new address[](2);
    destinations[0] = fulfiller;
    destinations[1] = feeRecipient;
    uint256[] memory amounts = new uint256[](2);
    amounts[0] = 90e6;
    amounts[1] = 10e6;

    vm.prank(funder);
    escrow.release(id, destinations, amounts);

    assertEq(usdc.balanceOf(fulfiller), 90e6);
    assertEq(usdc.balanceOf(feeRecipient), 10e6);
    assertEq(usdc.balanceOf(address(escrow)), 0);

    (uint64 completed, uint64 refunded, uint256 volumeSettled) = escrow.reputationOf(fulfiller);
    assertEq(completed, 1);
    assertEq(refunded, 0);
    assertEq(volumeSettled, 100e6);
  }

  function test_ReleaseRevertsForNonFunder() public {
    vm.prank(funder);
    uint256 id = escrow.createMandate(fulfiller, 100e6, 0);

    address[] memory destinations = new address[](1);
    destinations[0] = fulfiller;
    uint256[] memory amounts = new uint256[](1);
    amounts[0] = 100e6;

    vm.prank(stranger);
    vm.expectRevert(bytes("only the funder can release"));
    escrow.release(id, destinations, amounts);
  }

  function test_ReleaseRevertsWhenSplitDoesNotSumToAmount() public {
    vm.prank(funder);
    uint256 id = escrow.createMandate(fulfiller, 100e6, 0);

    address[] memory destinations = new address[](1);
    destinations[0] = fulfiller;
    uint256[] memory amounts = new uint256[](1);
    amounts[0] = 40e6;

    vm.prank(funder);
    vm.expectRevert(bytes("split does not sum to mandate amount"));
    escrow.release(id, destinations, amounts);
  }

  function test_RefundReturnsFundsAfterDeadlineAndMarksFulfillerRefunded() public {
    vm.prank(funder);
    uint256 id = escrow.createMandate(fulfiller, 100e6, block.timestamp + 1 days);

    vm.warp(block.timestamp + 1 days + 1);
    escrow.refund(id);

    assertEq(usdc.balanceOf(funder), 1_000e6);
    (, , , , , MandateEscrow.Status status) = escrow.mandates(id);
    assertEq(uint8(status), uint8(MandateEscrow.Status.Refunded));

    (uint64 completed, uint64 refunded, ) = escrow.reputationOf(fulfiller);
    assertEq(completed, 0);
    assertEq(refunded, 1);
  }

  function test_RefundRevertsBeforeDeadline() public {
    vm.prank(funder);
    uint256 id = escrow.createMandate(fulfiller, 100e6, block.timestamp + 1 days);

    vm.expectRevert(bytes("deadline not reached"));
    escrow.refund(id);
  }

  function test_RefundRevertsAfterProofSubmitted() public {
    vm.prank(funder);
    uint256 id = escrow.createMandate(fulfiller, 100e6, block.timestamp + 1 days);

    vm.prank(fulfiller);
    escrow.submitProof(id, keccak256("proof"));

    vm.warp(block.timestamp + 1 days + 1);
    vm.expectRevert(bytes("mandate not refundable"));
    escrow.refund(id);
  }
}
