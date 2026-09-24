// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { AgentVault } from "./AgentVault.sol";
import { MandateEscrow } from "./MandateEscrow.sol";
import { MockUSDC } from "./test/MockUSDC.sol";

contract AgentVaultTest is Test {
  AgentVault vault;
  MandateEscrow escrow;
  MockUSDC usdc;

  address owner = address(0xA1);
  address operator = address(0xB1);
  address guardian = address(0xC1);
  address payee = address(0xD1);
  address payee2 = address(0xD2);
  address stranger = address(0xE1);

  uint256 constant PER_PAYMENT = 10e6;
  uint256 constant DAILY = 50e6;

  event Paid(address indexed operator, address indexed to, uint256 amount, uint256 indexed mandateId, bytes32 ref);

  function setUp() public {
    vm.warp(1_800_000_000);
    usdc = new MockUSDC();
    escrow = new MandateEscrow(address(usdc));
    vault = new AgentVault(address(usdc), address(escrow), owner, operator, guardian, PER_PAYMENT, DAILY, true);

    usdc.mint(address(vault), 1_000e6);
    vm.prank(owner);
    vault.setPayee(payee, true);
  }

  // ------------------------------------------------------- construction

  function test_ConstructorSetsPolicy() public view {
    AgentVault.Policy memory p = vault.policy();
    assertEq(p.owner, owner);
    assertEq(p.operator, operator);
    assertEq(p.guardian, guardian);
    assertEq(p.perPaymentCap, PER_PAYMENT);
    assertEq(p.dailyCap, DAILY);
    assertEq(p.available, DAILY);
    assertTrue(p.allowlistRequired);
    assertFalse(p.paused);
    assertEq(p.balance, 1_000e6);
  }

  function test_ConstructorRejectsBadInputs() public {
    vm.expectRevert(bytes("zero address"));
    new AgentVault(address(0), address(escrow), owner, operator, guardian, PER_PAYMENT, DAILY, true);
    vm.expectRevert(bytes("zero address"));
    new AgentVault(address(usdc), address(0), owner, operator, guardian, PER_PAYMENT, DAILY, true);
    vm.expectRevert(bytes("per-payment cap must be > 0"));
    new AgentVault(address(usdc), address(escrow), owner, operator, guardian, 0, DAILY, true);
    vm.expectRevert(bytes("daily cap must cover one payment"));
    new AgentVault(address(usdc), address(escrow), owner, operator, guardian, PER_PAYMENT, PER_PAYMENT - 1, true);
    vm.expectRevert(bytes("daily cap too large"));
    new AgentVault(address(usdc), address(escrow), owner, operator, guardian, PER_PAYMENT, uint256(type(uint128).max) + 1, true);
  }

  // ---------------------------------------------------------------- pay

  function test_PayCreatesAndReleasesAMandateAtomically() public {
    vm.expectEmit(true, true, true, true);
    emit Paid(operator, payee, 4e6, 0, keccak256("obligation-1"));

    vm.prank(operator);
    uint256 id = vault.pay(payee, 4e6, keccak256("obligation-1"));

    assertEq(id, 0);
    assertEq(usdc.balanceOf(payee), 4e6);
    assertEq(usdc.balanceOf(address(vault)), 996e6);
    assertEq(usdc.balanceOf(address(escrow)), 0);
    assertEq(usdc.allowance(address(vault), address(escrow)), 0);

    (address funder, address fulfiller, uint256 amount, , , MandateEscrow.Status status) = escrow.mandates(id);
    assertEq(funder, address(vault));
    assertEq(fulfiller, payee);
    assertEq(amount, 4e6);
    assertEq(uint8(status), uint8(MandateEscrow.Status.Released));

    (uint64 completed, uint64 refunded, uint256 volume) = escrow.reputationOf(payee);
    assertEq(completed, 1);
    assertEq(refunded, 0);
    assertEq(volume, 4e6);
  }

  function test_OnlyTheOperatorCanPay() public {
    vm.prank(owner);
    vm.expectRevert(bytes("only the operator"));
    vault.pay(payee, 1e6, bytes32(0));

    vm.prank(stranger);
    vm.expectRevert(bytes("only the operator"));
    vault.pay(payee, 1e6, bytes32(0));

    vm.prank(guardian);
    vm.expectRevert(bytes("only the operator"));
    vault.pay(payee, 1e6, bytes32(0));
  }

  function test_PayRejectsBadAmountsAndPayees() public {
    vm.startPrank(operator);
    vm.expectRevert(bytes("amount must be > 0"));
    vault.pay(payee, 0, bytes32(0));

    vm.expectRevert(bytes("over per-payment cap"));
    vault.pay(payee, PER_PAYMENT + 1, bytes32(0));

    vm.expectRevert(bytes("zero payee"));
    vault.pay(address(0), 1e6, bytes32(0));

    vm.expectRevert(bytes("invalid payee"));
    vault.pay(address(vault), 1e6, bytes32(0));
    vm.expectRevert(bytes("invalid payee"));
    vault.pay(address(escrow), 1e6, bytes32(0));
    vm.expectRevert(bytes("invalid payee"));
    vault.pay(address(usdc), 1e6, bytes32(0));
    vm.stopPrank();
  }

  function test_PayCannotStrandFundsEvenWithTheAllowlistOff() public {
    vm.prank(owner);
    vault.setAllowlistRequired(false);

    vm.startPrank(operator);
    vm.expectRevert(bytes("invalid payee"));
    vault.pay(address(escrow), 1e6, bytes32(0));
    vm.stopPrank();
    assertEq(usdc.balanceOf(address(escrow)), 0);
  }

  function test_PayFailsCleanlyWhenTheVaultIsTooPoor() public {
    AgentVault poor = new AgentVault(address(usdc), address(escrow), owner, operator, guardian, PER_PAYMENT, DAILY, false);
    usdc.mint(address(poor), 1e6);

    vm.prank(operator);
    vm.expectRevert();
    poor.pay(payee, 2e6, bytes32(0));
    assertEq(poor.availableNow(), DAILY, "a failed pay must not spend allowance");
  }

  // ---------------------------------------------------------- allowlist

  function test_AllowlistBlocksUnknownPayees() public {
    vm.prank(operator);
    vm.expectRevert(bytes("payee not allowed"));
    vault.pay(payee2, 1e6, bytes32(0));
  }

  function test_OwnerCanAddRemoveAndBatchPayees() public {
    address[] memory batch = new address[](2);
    batch[0] = payee2;
    batch[1] = stranger;
    vm.prank(owner);
    vault.setPayees(batch, true);

    vm.prank(operator);
    vault.pay(payee2, 1e6, bytes32(0));

    vm.prank(owner);
    vault.setPayee(payee2, false);
    vm.prank(operator);
    vm.expectRevert(bytes("payee not allowed"));
    vault.pay(payee2, 1e6, bytes32(0));
  }

  function test_TurningTheAllowlistOffLetsAnyPayeeThrough() public {
    vm.prank(owner);
    vault.setAllowlistRequired(false);
    vm.prank(operator);
    vault.pay(payee2, 1e6, bytes32(0));
    assertEq(usdc.balanceOf(payee2), 1e6);
  }

  function test_OnlyTheOwnerManagesTheAllowlist() public {
    vm.startPrank(operator);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
    vault.setPayee(payee2, true);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
    vault.setAllowlistRequired(false);
    vm.stopPrank();
  }

  // ---------------------------------------------------------- daily cap

  function test_DailyCapIsEnforcedAndRefillsContinuously() public {
    vm.startPrank(operator);
    for (uint256 i = 0; i < 5; i++) vault.pay(payee, PER_PAYMENT, bytes32(i));
    assertEq(vault.availableNow(), 0);

    vm.expectRevert(bytes("over daily allowance"));
    vault.pay(payee, 1, bytes32(0));

    // Half a day refills half the cap.
    vm.warp(block.timestamp + 12 hours);
    assertEq(vault.availableNow(), DAILY / 2);
    vault.pay(payee, PER_PAYMENT, bytes32(0));
    vault.pay(payee, PER_PAYMENT, bytes32(0));
    vm.expectRevert(bytes("over daily allowance"));
    vault.pay(payee, PER_PAYMENT, bytes32(0));
    vm.stopPrank();
  }

  function test_RefillNeverExceedsTheCap() public {
    vm.warp(block.timestamp + 30 days);
    assertEq(vault.availableNow(), DAILY);
  }

  function test_SpendingTheWholeCapDoesNotUnlockAnotherOneAcrossAMidnightBoundary() public {
    vm.startPrank(operator);
    for (uint256 i = 0; i < 5; i++) vault.pay(payee, PER_PAYMENT, bytes32(i));
    vm.stopPrank();

    // A fixed daily window would reset here. The bucket only gives back one second's worth.
    vm.warp(block.timestamp + 1);
    assertLe(vault.availableNow(), DAILY / 1 days + 1);
    vm.prank(operator);
    vm.expectRevert(bytes("over daily allowance"));
    vault.pay(payee, PER_PAYMENT, bytes32(0));
  }

  // -------------------------------------------------------------- pause

  function test_OwnerAndGuardianCanPauseButOnlyOwnerCanResume() public {
    vm.prank(guardian);
    vault.pause();
    assertTrue(vault.paused());

    vm.prank(operator);
    vm.expectRevert(Pausable.EnforcedPause.selector);
    vault.pay(payee, 1e6, bytes32(0));

    vm.prank(guardian);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, guardian));
    vault.unpause();

    vm.prank(owner);
    vault.unpause();
    vm.prank(operator);
    vault.pay(payee, 1e6, bytes32(0));

    vm.prank(owner);
    vault.pause();
    assertTrue(vault.paused());
  }

  function test_StrangersAndTheOperatorCannotPause() public {
    vm.prank(stranger);
    vm.expectRevert(bytes("only owner or guardian"));
    vault.pause();
    vm.prank(operator);
    vm.expectRevert(bytes("only owner or guardian"));
    vault.pause();
  }

  function test_TheOwnerCanStillWithdrawWhilePaused() public {
    vm.prank(owner);
    vault.pause();
    vm.prank(owner);
    vault.withdraw(owner, 100e6);
    assertEq(usdc.balanceOf(owner), 100e6);
  }

  // ----------------------------------------------------------- withdraw

  function test_OnlyTheOwnerCanWithdraw() public {
    vm.prank(operator);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
    vault.withdraw(operator, 1e6);
    vm.prank(guardian);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, guardian));
    vault.withdraw(guardian, 1e6);
  }

  function test_WithdrawRejectsZeroAddressAndOverdraw() public {
    vm.startPrank(owner);
    vm.expectRevert(bytes("zero address"));
    vault.withdraw(address(0), 1e6);
    vm.expectRevert();
    vault.withdraw(owner, 1_000e6 + 1);
    vault.withdraw(owner, 1_000e6);
    vm.stopPrank();
    assertEq(usdc.balanceOf(address(vault)), 0);
  }

  // ----------------------------------------------------------- operator

  function test_RotatingTheOperatorRevokesTheOldOne() public {
    address fresh = address(0xB2);
    vm.prank(owner);
    vault.setOperator(fresh);

    vm.prank(operator);
    vm.expectRevert(bytes("only the operator"));
    vault.pay(payee, 1e6, bytes32(0));
    vm.prank(fresh);
    vault.pay(payee, 1e6, bytes32(0));
  }

  function test_SettingTheOperatorToZeroFreezesPayments() public {
    vm.prank(owner);
    vault.setOperator(address(0));
    vm.prank(operator);
    vm.expectRevert(bytes("only the operator"));
    vault.pay(payee, 1e6, bytes32(0));
  }

  function test_OnlyTheOwnerCanRotateOperatorOrGuardian() public {
    vm.startPrank(operator);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
    vault.setOperator(stranger);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
    vault.setGuardian(stranger);
    vm.stopPrank();
  }

  // ------------------------------------------------------------- limits

  function test_SetLimitsValidatesAndIsOwnerOnly() public {
    vm.prank(operator);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
    vault.setLimits(1e6, 2e6);

    vm.startPrank(owner);
    vm.expectRevert(bytes("per-payment cap must be > 0"));
    vault.setLimits(0, 2e6);
    vm.expectRevert(bytes("daily cap must cover one payment"));
    vault.setLimits(5e6, 4e6);
    vm.stopPrank();
  }

  function test_LoweringTheCapClampsTheBucket() public {
    vm.prank(owner);
    vault.setLimits(2e6, 10e6);
    assertEq(vault.availableNow(), 10e6);
    assertEq(vault.perPaymentCap(), 2e6);
  }

  function test_RaisingTheCapDoesNotInstantlyRefill() public {
    vm.startPrank(operator);
    for (uint256 i = 0; i < 5; i++) vault.pay(payee, PER_PAYMENT, bytes32(i));
    vm.stopPrank();
    assertEq(vault.availableNow(), 0);

    vm.prank(owner);
    vault.setLimits(PER_PAYMENT, DAILY * 10);
    assertEq(vault.availableNow(), 0);

    vm.warp(block.timestamp + 1 hours);
    assertEq(vault.availableNow(), (DAILY * 10) / 24);
  }

  function test_ChangingLimitsSettlesRefillUnderTheOldCapFirst() public {
    vm.startPrank(operator);
    for (uint256 i = 0; i < 5; i++) vault.pay(payee, PER_PAYMENT, bytes32(i));
    vm.stopPrank();

    vm.warp(block.timestamp + 12 hours);
    vm.prank(owner);
    vault.setLimits(PER_PAYMENT, DAILY * 2);
    // Twelve hours accrued at the old rate (DAILY per day), not the new one.
    assertEq(vault.availableNow(), DAILY / 2);
  }

  // ---------------------------------------------------------- ownership

  function test_OwnershipTransfersInTwoSteps() public {
    address next = address(0xA2);
    vm.prank(owner);
    vault.transferOwnership(next);
    assertEq(vault.owner(), owner, "still the old owner until accepted");

    vm.prank(next);
    vault.acceptOwnership();
    assertEq(vault.owner(), next);

    vm.prank(owner);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
    vault.withdraw(owner, 1e6);
    vm.prank(next);
    vault.withdraw(next, 1e6);
  }

  function test_ARandomAddressCannotAcceptAPendingTransfer() public {
    vm.prank(owner);
    vault.transferOwnership(address(0xA2));
    vm.prank(stranger);
    vm.expectRevert();
    vault.acceptOwnership();
  }

  function test_RenouncingOwnershipIsDisabled() public {
    vm.prank(owner);
    vm.expectRevert(bytes("renouncing ownership is disabled"));
    vault.renounceOwnership();
    assertEq(vault.owner(), owner);
  }

  // -------------------------------------------------------------- fuzz

  /// Whatever sequence of payments and pauses in time is thrown at it, total
  /// spend never exceeds the starting cap plus what has refilled since.
  function testFuzz_SpendNeverOutrunsCapPlusRefill(
    uint32[8] memory dts,
    uint32[8] memory amounts
  ) public {
    uint256 start = block.timestamp;
    uint256 spent;

    for (uint256 i = 0; i < 8; i++) {
      vm.warp(block.timestamp + (uint256(dts[i]) % 2 days));
      uint256 amount = 1 + (uint256(amounts[i]) % PER_PAYMENT);
      vm.prank(operator);
      try vault.pay(payee, amount, bytes32(i)) {
        spent += amount;
      } catch {}
      assertLe(spent, DAILY + ((block.timestamp - start) * DAILY) / 1 days, "spent more than cap plus refill");
      assertLe(vault.availableNow(), DAILY, "bucket above the cap");
    }
  }

  function testFuzz_PaymentsNeverExceedThePerPaymentCap(uint256 amount) public {
    vm.prank(operator);
    if (amount == 0 || amount > PER_PAYMENT) {
      vm.expectRevert();
      vault.pay(payee, amount, bytes32(0));
    } else {
      vault.pay(payee, amount, bytes32(0));
      assertEq(usdc.balanceOf(payee), amount);
    }
  }

  function testFuzz_VaultPlusPayeesAlwaysEqualsWhatWasFunded(uint32[6] memory amounts) public {
    uint256 paid;
    for (uint256 i = 0; i < 6; i++) {
      uint256 amount = 1 + (uint256(amounts[i]) % PER_PAYMENT);
      vm.warp(block.timestamp + 1 days);
      vm.prank(operator);
      vault.pay(payee, amount, bytes32(i));
      paid += amount;
    }
    assertEq(usdc.balanceOf(address(vault)) + usdc.balanceOf(payee), 1_000e6);
    assertEq(usdc.balanceOf(payee), paid);
    assertEq(usdc.balanceOf(address(escrow)), 0);
  }
}
