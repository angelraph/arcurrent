// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * The general form of what ObligationEscrow does for one treasury's own
 * obligations: anyone can fund a mandate for anyone (or leave it open), a
 * fulfiller posts proof, the funder releases USDC atomically to one or more
 * destinations in a single transaction, and every outcome updates an
 * on-chain reputation ledger keyed by address. No oracle, no dispute
 * arbitration — the funder's release is the only condition, which is the
 * whole point: this proves atomicity, multi-party settlement, and portable
 * reputation without pretending to solve trust-minimized arbitration too.
 * A funder can still grief a fulfiller by withholding release after a
 * proof is submitted; there's no recourse for that here by design.
 */
contract MandateEscrow {
  using SafeERC20 for IERC20;

  enum Status {
    None,
    Funded,
    Fulfilled,
    Released,
    Refunded
  }

  struct Mandate {
    address funder;
    address fulfiller; // address(0) until an open mandate's first proof submission
    uint256 amount;
    uint256 deadline; // 0 means no refund path
    bytes32 proofHash;
    Status status;
  }

  struct Reputation {
    uint64 completed;
    uint64 refunded;
    uint256 volumeSettled;
  }

  IERC20 public immutable usdc;
  uint256 public nextMandateId;

  mapping(uint256 => Mandate) public mandates;
  mapping(address => Reputation) public reputationOf;

  event MandateCreated(
    uint256 indexed mandateId,
    address indexed funder,
    address indexed fulfiller,
    uint256 amount,
    uint256 deadline
  );
  event ProofSubmitted(uint256 indexed mandateId, address indexed fulfiller, bytes32 proofHash);
  event Released(uint256 indexed mandateId, address[] destinations, uint256[] amounts);
  event Refunded(uint256 indexed mandateId, address indexed funder, uint256 amount);

  constructor(address usdcAddress) {
    usdc = IERC20(usdcAddress);
  }

  /**
   * Creates and fully funds a mandate in one call — no separate deposit step,
   * so there's never a Mandate struct with an amount nobody has paid yet.
   * `fulfiller` may be address(0) to leave the mandate open to whoever
   * submits proof first. `deadline` of 0 means the funder is trusting the
   * fulfiller indefinitely and there is no refund path.
   */
  function createMandate(
    address fulfiller,
    uint256 amount,
    uint256 deadline
  ) external returns (uint256 mandateId) {
    require(amount > 0, "amount must be > 0");
    require(deadline == 0 || deadline > block.timestamp, "deadline must be in the future");

    mandateId = nextMandateId++;
    mandates[mandateId] = Mandate({
      funder: msg.sender,
      fulfiller: fulfiller,
      amount: amount,
      deadline: deadline,
      proofHash: bytes32(0),
      status: Status.Funded
    });

    usdc.safeTransferFrom(msg.sender, address(this), amount);
    emit MandateCreated(mandateId, msg.sender, fulfiller, amount, deadline);
  }

  /**
   * Posts proof of fulfillment. Callable by the mandate's designated
   * fulfiller, or by whoever gets there first on an open mandate — the first
   * caller on an open mandate becomes its recorded fulfiller for reputation
   * purposes.
   */
  function submitProof(uint256 mandateId, bytes32 proofHash) external {
    Mandate storage mandate = mandates[mandateId];
    require(mandate.status == Status.Funded, "mandate not awaiting proof");

    if (mandate.fulfiller == address(0)) {
      mandate.fulfiller = msg.sender;
    } else {
      require(mandate.fulfiller == msg.sender, "not the designated fulfiller");
    }

    mandate.proofHash = proofHash;
    mandate.status = Status.Fulfilled;
    emit ProofSubmitted(mandateId, mandate.fulfiller, proofHash);
  }

  /**
   * Funder-only, atomic multi-destination payout — the whole mandate amount
   * in one transaction, split however the funder specifies. Reputation is
   * credited to the mandate's recorded fulfiller (if any), independent of
   * where the funder actually routed the funds, since the fulfiller is the
   * accountable party regardless of downstream splits (fees, StableFX
   * proxies, etc).
   */
  function release(
    uint256 mandateId,
    address[] calldata destinations,
    uint256[] calldata amounts
  ) external {
    Mandate storage mandate = mandates[mandateId];
    require(mandate.funder == msg.sender, "only the funder can release");
    require(
      mandate.status == Status.Funded || mandate.status == Status.Fulfilled,
      "mandate not releasable"
    );
    require(destinations.length > 0, "no destinations");
    require(destinations.length == amounts.length, "destinations/amounts length mismatch");

    uint256 total = 0;
    for (uint256 i = 0; i < amounts.length; i++) {
      total += amounts[i];
    }
    require(total == mandate.amount, "split does not sum to mandate amount");

    mandate.status = Status.Released;

    if (mandate.fulfiller != address(0)) {
      Reputation storage rep = reputationOf[mandate.fulfiller];
      rep.completed += 1;
      rep.volumeSettled += mandate.amount;
    }

    for (uint256 i = 0; i < destinations.length; i++) {
      usdc.safeTransfer(destinations[i], amounts[i]);
    }

    emit Released(mandateId, destinations, amounts);
  }

  /**
   * Refunds an unfulfilled mandate to its funder once the deadline has
   * passed. Only reachable from Funded (no proof ever submitted) — once a
   * fulfiller has posted proof the mandate can only move forward via
   * release(), not backward via refund().
   */
  function refund(uint256 mandateId) external {
    Mandate storage mandate = mandates[mandateId];
    require(mandate.status == Status.Funded, "mandate not refundable");
    require(mandate.deadline != 0 && block.timestamp >= mandate.deadline, "deadline not reached");

    mandate.status = Status.Refunded;

    if (mandate.fulfiller != address(0)) {
      reputationOf[mandate.fulfiller].refunded += 1;
    }

    usdc.safeTransfer(mandate.funder, mandate.amount);
    emit Refunded(mandateId, mandate.funder, mandate.amount);
  }
}
