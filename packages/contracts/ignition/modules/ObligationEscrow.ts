import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// USDC's ERC-20 interface address is the same fixed precompile on both Arc
// Testnet and Arc Mainnet (packages/shared/src/chain.ts ARC_TESTNET/ARC_MAINNET
// .usdcErc20Address, verified against docs.arc.io 2026-09-22) — safe to default
// here. The treasury wallet address is NOT shared across networks: it's a
// distinct Circle-custodied wallet per network, so it has no safe default and
// must be passed explicitly for a mainnet deploy, e.g.:
//   hardhat ignition deploy ignition/modules/ObligationEscrow.ts --network arcMainnet \
//     --parameters '{"ObligationEscrowModule":{"treasuryWalletAddress":"0x..."}}'
const ARC_USDC = "0x3600000000000000000000000000000000000000";

export default buildModule("ObligationEscrowModule", (m) => {
  const usdcAddress = m.getParameter("usdcAddress", ARC_USDC);
  const treasuryWalletAddress = m.getParameter(
    "treasuryWalletAddress",
    "0x169737f2f93856fa72674b4771d59cb7b1979c8c"
  );
  const escrow = m.contract("ObligationEscrow", [usdcAddress, treasuryWalletAddress]);

  return { escrow };
});
