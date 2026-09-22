import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Same fixed USDC precompile address on Arc Testnet and Arc Mainnet — see the
// comment in ObligationEscrow.ts. MandateEscrow takes no other constructor
// arguments: unlike ObligationEscrow it has no owner, so there's nothing else
// network-specific to parameterize.
const ARC_USDC = "0x3600000000000000000000000000000000000000";

export default buildModule("MandateEscrowModule", (m) => {
  const usdcAddress = m.getParameter("usdcAddress", ARC_USDC);
  const escrow = m.contract("MandateEscrow", [usdcAddress]);

  return { escrow };
});
