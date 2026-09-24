import { defineChain, parseAbi } from "viem";

/**
 * Arc mainnet, and the one deployed MandateEscrow. Values verified against
 * docs.arc.io and the contract's own explorer page (source verified there).
 * USDC lives at the same fixed precompile address on every Arc network; its
 * ERC-20 view has 6 decimals (the 18-decimal figure is the native gas view,
 * which this SDK never touches).
 */
export const ARC_MAINNET = {
  chainId: 5042,
  name: "Arc Mainnet",
  rpcUrl: "https://rpc.mainnet.arc.io",
  explorerUrl: "https://explorer.arc.io",
  usdcAddress: "0x3600000000000000000000000000000000000000",
  usdcDecimals: 6,
  mandateEscrowAddress: "0xca901f58fb82FE5FF459264a419b8cF8c75b3371",
} as const;

export const arcMainnetChain = defineChain({
  id: ARC_MAINNET.chainId,
  name: ARC_MAINNET.name,
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_MAINNET.rpcUrl] } },
  blockExplorers: { default: { name: "Arc Explorer", url: ARC_MAINNET.explorerUrl } },
});

export const mandateEscrowAbi = parseAbi([
  "function usdc() view returns (address)",
  "function nextMandateId() view returns (uint256)",
  "function mandates(uint256) view returns (address funder, address fulfiller, uint256 amount, uint256 deadline, bytes32 proofHash, uint8 status)",
  "function reputationOf(address) view returns (uint64 completed, uint64 refunded, uint256 volumeSettled)",
  "function createMandate(address fulfiller, uint256 amount, uint256 deadline) returns (uint256 mandateId)",
  "function submitProof(uint256 mandateId, bytes32 proofHash)",
  "function release(uint256 mandateId, address[] destinations, uint256[] amounts)",
  "function refund(uint256 mandateId)",
  "event MandateCreated(uint256 indexed mandateId, address indexed funder, address indexed fulfiller, uint256 amount, uint256 deadline)",
  "event ProofSubmitted(uint256 indexed mandateId, address indexed fulfiller, bytes32 proofHash)",
  "event Released(uint256 indexed mandateId, address[] destinations, uint256[] amounts)",
  "event Refunded(uint256 indexed mandateId, address indexed funder, uint256 amount)",
]);

export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
]);

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
export const ZERO_HASH = `0x${"00".repeat(32)}` as const;

/** Contract enum order: None, Funded, Fulfilled, Released, Refunded. */
export const MANDATE_STATUSES = ["None", "Funded", "Fulfilled", "Released", "Refunded"] as const;
export type MandateStatus = (typeof MANDATE_STATUSES)[number];

export const ARC_TESTNET = {
  chainId: 5042002,
  name: "Arc Testnet",
  rpcUrl: "https://rpc.testnet.arc.network",
  explorerUrl: "https://testnet.arcscan.app",
  usdcAddress: "0x3600000000000000000000000000000000000000",
  usdcDecimals: 6,
} as const;

export const arcTestnetChain = defineChain({
  id: ARC_TESTNET.chainId,
  name: ARC_TESTNET.name,
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_TESTNET.rpcUrl] } },
  blockExplorers: { default: { name: "Arc Testnet Explorer", url: ARC_TESTNET.explorerUrl } },
});

export const agentVaultAbi = parseAbi([
  "struct Policy { address owner; address operator; address guardian; uint256 perPaymentCap; uint256 dailyCap; uint256 available; bool allowlistRequired; bool paused; uint256 balance; }",
  "function usdc() view returns (address)",
  "function escrow() view returns (address)",
  "function owner() view returns (address)",
  "function pendingOwner() view returns (address)",
  "function operator() view returns (address)",
  "function guardian() view returns (address)",
  "function perPaymentCap() view returns (uint256)",
  "function dailyCap() view returns (uint256)",
  "function allowlistRequired() view returns (bool)",
  "function isAllowedPayee(address) view returns (bool)",
  "function paused() view returns (bool)",
  "function availableNow() view returns (uint256)",
  "function policy() view returns (Policy)",
  "function pay(address to, uint256 amount, bytes32 ref) returns (uint256 mandateId)",
  "function withdraw(address to, uint256 amount)",
  "function setOperator(address newOperator)",
  "function setGuardian(address newGuardian)",
  "function setLimits(uint256 newPerPaymentCap, uint256 newDailyCap)",
  "function setAllowlistRequired(bool required)",
  "function setPayee(address payee, bool allowed)",
  "function setPayees(address[] payees, bool allowed)",
  "function pause()",
  "function unpause()",
  "function transferOwnership(address newOwner)",
  "function acceptOwnership()",
  "event Paid(address indexed operator, address indexed to, uint256 amount, uint256 indexed mandateId, bytes32 ref)",
  "event Withdrawn(address indexed to, uint256 amount)",
  "event OperatorSet(address indexed operator)",
  "event GuardianSet(address indexed guardian)",
  "event LimitsSet(uint256 perPaymentCap, uint256 dailyCap)",
  "event AllowlistRequiredSet(bool required)",
  "event PayeeSet(address indexed payee, bool allowed)",
]);
