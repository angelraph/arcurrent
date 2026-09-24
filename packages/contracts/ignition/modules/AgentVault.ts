import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Same fixed USDC precompile address on every Arc network (see MandateEscrow.ts).
const ARC_USDC = "0x3600000000000000000000000000000000000000";

/**
 * Parameters (pass with --parameters <file.json>, keyed by module name):
 *   escrowAddress   the MandateEscrow this vault pays through   (required)
 *   owner           the wallet that controls the rules and can always withdraw (required)
 *   operator        the agent's signing wallet: may only call pay()            (required)
 *   guardian        may pause but never resume; the zero address disables it
 *   perPaymentCap   base units (6 decimals), e.g. 1000000 = 1 USDC
 *   dailyCap        base units, refills continuously over 24h
 *   allowlistRequired  whether the operator may only pay owner-approved payees
 */
export default buildModule("AgentVaultModule", (m) => {
  const vault = m.contract("AgentVault", [
    m.getParameter("usdcAddress", ARC_USDC),
    m.getParameter("escrowAddress"),
    m.getParameter("owner"),
    m.getParameter("operator"),
    m.getParameter("guardian", "0x0000000000000000000000000000000000000000"),
    m.getParameter("perPaymentCap", 1_000_000n),
    m.getParameter("dailyCap", 5_000_000n),
    m.getParameter("allowlistRequired", true),
  ]);

  return { vault };
});
