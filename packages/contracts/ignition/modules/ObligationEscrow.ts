import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// USDC's ERC-20 interface address on Arc Testnet (packages/shared/src/chain.ts
// ARC_TESTNET.usdcErc20Address) and the Circle-custodied treasury wallet
// address (.env TREASURY_WALLET_ADDRESS) — the wallet that will call
// settle() via Circle's contract-execution transactions, so it must own
// this contract.
const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000";
const TREASURY_WALLET_ADDRESS = "0x169737f2f93856fa72674b4771d59cb7b1979c8c";

export default buildModule("ObligationEscrowModule", (m) => {
  const escrow = m.contract("ObligationEscrow", [ARC_TESTNET_USDC, TREASURY_WALLET_ADDRESS]);

  return { escrow };
});
