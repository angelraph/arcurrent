// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable, Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// The slice of MandateEscrow the vault uses.
interface IMandateEscrow {
  function createMandate(address fulfiller, uint256 amount, uint256 deadline) external returns (uint256 mandateId);

  function release(uint256 mandateId, address[] calldata destinations, uint256[] calldata amounts) external;
}

/**
 * Bounded autonomy for an agent that pays from a treasury.
 *
 * The vault holds the USDC. An owner (a wallet a human controls) sets the
 * rules; an operator (the agent's signing wallet) can do exactly one thing,
 * `pay`, and only inside those rules. If the operator's credentials leak, the
 * attacker gets a spending allowance the owner chose, not the balance:
 *
 *   - a per-payment cap,
 *   - a daily cap that refills continuously (a token bucket, so there is no
 *     midnight boundary at which a full cap can be spent twice in a row),
 *   - an optional allowlist of payees the operator may pay,
 *   - a pause switch the owner or a guardian can throw.
 *
 * The operator can never withdraw, change a rule, or pay outside the rules.
 * The owner can always withdraw, even while paused. Each payment is a
 * mandate on MandateEscrow created and released by the vault in one atomic
 * transaction, so it lands in the same public reputation ledger as every
 * other mandate.
 *
 * What it does not do: it cannot tell whether a payment is deserved. A
 * compromised operator can still spend up to the caps on payees the rules
 * allow. The guarantee is a bounded worst case that the owner picked, not
 * good judgement. Compromise of the owner wallet is compromise of the vault.
 *
 * Not professionally audited.
 */
contract AgentVault is Ownable2Step, Pausable, ReentrancyGuard {
  using SafeERC20 for IERC20;

  struct Policy {
    address owner;
    address operator;
    address guardian;
    uint256 perPaymentCap;
    uint256 dailyCap;
    /// Allowance available to spend right now, after refill.
    uint256 available;
    bool allowlistRequired;
    bool paused;
    /// USDC currently held by the vault.
    uint256 balance;
  }

  /// Keeps `elapsed * dailyCap` far from overflow for any realistic timestamp.
  uint256 public constant MAX_DAILY_CAP = type(uint128).max;

  IERC20 public immutable usdc;
  IMandateEscrow public immutable escrow;

  address public operator;
  address public guardian;
  uint256 public perPaymentCap;
  uint256 public dailyCap;
  bool public allowlistRequired;
  mapping(address => bool) public isAllowedPayee;

  // Token bucket: `bucketLevel` as of `lastRefill`, refilling at dailyCap per day up to dailyCap.
  uint256 private bucketLevel;
  uint64 private lastRefill;

  event Paid(address indexed operator, address indexed to, uint256 amount, uint256 indexed mandateId, bytes32 ref);
  event Withdrawn(address indexed to, uint256 amount);
  event OperatorSet(address indexed operator);
  event GuardianSet(address indexed guardian);
  event LimitsSet(uint256 perPaymentCap, uint256 dailyCap);
  event AllowlistRequiredSet(bool required);
  event PayeeSet(address indexed payee, bool allowed);

  modifier onlyOperator() {
    require(msg.sender == operator, "only the operator");
    _;
  }

  constructor(
    address usdcAddress,
    address escrowAddress,
    address initialOwner,
    address initialOperator,
    address initialGuardian,
    uint256 initialPerPaymentCap,
    uint256 initialDailyCap,
    bool initialAllowlistRequired
  ) Ownable(initialOwner) {
    require(usdcAddress != address(0) && escrowAddress != address(0), "zero address");
    usdc = IERC20(usdcAddress);
    escrow = IMandateEscrow(escrowAddress);

    _checkLimits(initialPerPaymentCap, initialDailyCap);
    perPaymentCap = initialPerPaymentCap;
    dailyCap = initialDailyCap;
    bucketLevel = initialDailyCap;
    lastRefill = uint64(block.timestamp);

    operator = initialOperator;
    guardian = initialGuardian;
    allowlistRequired = initialAllowlistRequired;
    emit OperatorSet(initialOperator);
    emit GuardianSet(initialGuardian);
    emit LimitsSet(initialPerPaymentCap, initialDailyCap);
    emit AllowlistRequiredSet(initialAllowlistRequired);
  }

  // ------------------------------------------------------------ operator

  /**
   * Pays `amount` to `to` as a mandate on MandateEscrow, created and released
   * in this one transaction, with `to` as the recorded fulfiller so the payee
   * is credited in the reputation ledger. `ref` is an opaque tag (the agent
   * uses a hash of its obligation id) echoed in the event.
   */
  function pay(
    address to,
    uint256 amount,
    bytes32 ref
  ) external onlyOperator whenNotPaused nonReentrant returns (uint256 mandateId) {
    require(to != address(0), "zero payee");
    // Paying any of these would strand the funds rather than deliver them.
    require(to != address(this) && to != address(escrow) && to != address(usdc), "invalid payee");
    require(amount > 0, "amount must be > 0");
    require(amount <= perPaymentCap, "over per-payment cap");
    if (allowlistRequired) require(isAllowedPayee[to], "payee not allowed");

    uint256 available = _available();
    require(amount <= available, "over daily allowance");
    bucketLevel = available - amount;
    lastRefill = uint64(block.timestamp);

    usdc.forceApprove(address(escrow), amount);
    mandateId = escrow.createMandate(to, amount, 0);

    address[] memory destinations = new address[](1);
    uint256[] memory amounts = new uint256[](1);
    destinations[0] = to;
    amounts[0] = amount;
    escrow.release(mandateId, destinations, amounts);

    emit Paid(msg.sender, to, amount, mandateId, ref);
  }

  // --------------------------------------------------------------- owner

  /// Always available, including while paused: the owner is never locked out of the funds.
  function withdraw(address to, uint256 amount) external onlyOwner nonReentrant {
    require(to != address(0), "zero address");
    usdc.safeTransfer(to, amount);
    emit Withdrawn(to, amount);
  }

  function setOperator(address newOperator) external onlyOwner {
    operator = newOperator;
    emit OperatorSet(newOperator);
  }

  function setGuardian(address newGuardian) external onlyOwner {
    guardian = newGuardian;
    emit GuardianSet(newGuardian);
  }

  /**
   * Changes both caps. Refill up to now is settled under the old cap first,
   * then the bucket is clamped to the new cap. Raising the cap does not
   * instantly refill the bucket; it refills at the new rate from here.
   */
  function setLimits(uint256 newPerPaymentCap, uint256 newDailyCap) external onlyOwner {
    _checkLimits(newPerPaymentCap, newDailyCap);
    uint256 available = _available();
    perPaymentCap = newPerPaymentCap;
    dailyCap = newDailyCap;
    bucketLevel = available > newDailyCap ? newDailyCap : available;
    lastRefill = uint64(block.timestamp);
    emit LimitsSet(newPerPaymentCap, newDailyCap);
  }

  function setAllowlistRequired(bool required) external onlyOwner {
    allowlistRequired = required;
    emit AllowlistRequiredSet(required);
  }

  function setPayee(address payee, bool allowed) external onlyOwner {
    isAllowedPayee[payee] = allowed;
    emit PayeeSet(payee, allowed);
  }

  function setPayees(address[] calldata payees, bool allowed) external onlyOwner {
    for (uint256 i = 0; i < payees.length; i++) {
      isAllowedPayee[payees[i]] = allowed;
      emit PayeeSet(payees[i], allowed);
    }
  }

  /// The owner or the guardian can stop payments. Only the owner can resume them.
  function pause() external {
    require(msg.sender == owner() || msg.sender == guardian, "only owner or guardian");
    _pause();
  }

  function unpause() external onlyOwner {
    _unpause();
  }

  /// Disabled: renouncing would leave the funds with no one able to withdraw them.
  function renounceOwnership() public pure override {
    revert("renouncing ownership is disabled");
  }

  // --------------------------------------------------------------- views

  /// What the operator could pay out this instant, after refill.
  function availableNow() external view returns (uint256) {
    return _available();
  }

  /// Everything a dashboard or agent needs about the rules, in one call.
  function policy() external view returns (Policy memory) {
    return
      Policy({
        owner: owner(),
        operator: operator,
        guardian: guardian,
        perPaymentCap: perPaymentCap,
        dailyCap: dailyCap,
        available: _available(),
        allowlistRequired: allowlistRequired,
        paused: paused(),
        balance: usdc.balanceOf(address(this))
      });
  }

  // ------------------------------------------------------------ internal

  function _available() internal view returns (uint256) {
    uint256 refilled = bucketLevel + ((block.timestamp - lastRefill) * dailyCap) / 1 days;
    return refilled > dailyCap ? dailyCap : refilled;
  }

  function _checkLimits(uint256 perPayment, uint256 daily) internal pure {
    require(perPayment > 0, "per-payment cap must be > 0");
    require(daily >= perPayment, "daily cap must cover one payment");
    require(daily <= MAX_DAILY_CAP, "daily cap too large");
  }
}
