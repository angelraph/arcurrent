import { config } from "dotenv";
config({ path: ".env" });
import { createWalletClient, http, parseAbi, parseUnits, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcPublicClient, getActiveArcNetwork } from "@arcurrent/shared";

/**
 * Runs one real createMandate -> submitProof -> release cycle against a
 * deployed MandateEscrow, end to end, and prints every tx hash -- the same
 * "captured once, real, labeled" methodology the deck's Proof slide uses
 * (the two settlements it shows came from the agent's real evaluation loop,
 * not this script, but the same discipline applies). Two throwaway EOAs
 * sign directly (no Circle wallet involved): MandateEscrow is permissionless,
 * funder and fulfiller are just whichever addresses call it, which is the
 * whole point of it being an open primitive rather than a project-owned
 * contract.
 */
const mandateEscrowAbi = parseAbi([
  "function createMandate(address fulfiller, uint256 amount, uint256 deadline) returns (uint256)",
  "function submitProof(uint256 mandateId, bytes32 proofHash)",
  "function release(uint256 mandateId, address[] destinations, uint256[] amounts)",
  "function nextMandateId() view returns (uint256)",
  "event MandateCreated(uint256 indexed mandateId, address indexed funder, address indexed fulfiller, uint256 amount, uint256 deadline)",
]);
const erc20Abi = parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]);

async function main() {
  const escrowAddress = process.argv[2] ?? process.env.MANDATE_ESCROW_ADDRESS;
  const amountArg = process.argv[3] ?? "0.10";
  if (!escrowAddress) {
    throw new Error("Usage: tsx scripts/mandate-demo.ts <escrowAddress> [amountUsdc] (or set MANDATE_ESCROW_ADDRESS)");
  }

  const funderKey = process.env.MANDATE_DEMO_FUNDER_PRIVATE_KEY as `0x${string}` | undefined;
  const fulfillerKey = process.env.MANDATE_DEMO_FULFILLER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!funderKey || !fulfillerKey) {
    throw new Error(
      "MANDATE_DEMO_FUNDER_PRIVATE_KEY and MANDATE_DEMO_FULFILLER_PRIVATE_KEY must be set — two throwaway " +
        "EOAs, each funded with a little native USDC for gas (the funder also needs the demo amount in USDC)."
    );
  }

  const network = getActiveArcNetwork();
  const chain = {
    id: network.chainId,
    name: network.name,
    nativeCurrency: network.nativeCurrency,
    rpcUrls: { default: { http: [network.rpcUrls.default] } },
  };
  const transport = http(network.rpcUrls.default);

  const funder = createWalletClient({ account: privateKeyToAccount(funderKey), chain, transport });
  const fulfiller = createWalletClient({ account: privateKeyToAccount(fulfillerKey), chain, transport });
  const amount = parseUnits(amountArg, network.usdcErc20Decimals);

  console.log(`Network: ${network.name} (chain ${network.chainId})`);
  console.log(`Funder:    ${funder.account.address}`);
  console.log(`Fulfiller: ${fulfiller.account.address}`);
  console.log(`Amount:    ${amountArg} USDC`);

  const approveHash = await funder.writeContract({
    address: network.usdcErc20Address,
    abi: erc20Abi,
    functionName: "approve",
    args: [escrowAddress as `0x${string}`, amount],
  });
  await arcPublicClient.waitForTransactionReceipt({ hash: approveHash });
  console.log("approve tx:", approveHash);

  const createHash = await funder.writeContract({
    address: escrowAddress as `0x${string}`,
    abi: mandateEscrowAbi,
    functionName: "createMandate",
    args: [fulfiller.account.address, amount, 0n],
  });
  await arcPublicClient.waitForTransactionReceipt({ hash: createHash });
  console.log("createMandate tx:", createHash);

  // nextMandateId() is a running counter, so the mandate we just created is
  // always the one immediately before its current value.
  const nextId = await arcPublicClient.readContract({
    address: escrowAddress as `0x${string}`,
    abi: mandateEscrowAbi,
    functionName: "nextMandateId",
  });
  const mandateId = nextId - 1n;
  console.log("mandateId:", mandateId.toString());

  const proofHash = await fulfiller.writeContract({
    address: escrowAddress as `0x${string}`,
    abi: mandateEscrowAbi,
    functionName: "submitProof",
    args: [mandateId, `0x${Buffer.from("arc-microgrants-demo").toString("hex").padEnd(64, "0")}` as `0x${string}`],
  });
  await arcPublicClient.waitForTransactionReceipt({ hash: proofHash });
  console.log("submitProof tx:", proofHash);

  const releaseHash = await funder.writeContract({
    address: escrowAddress as `0x${string}`,
    abi: mandateEscrowAbi,
    functionName: "release",
    args: [mandateId, [fulfiller.account.address], [amount]],
  });
  await arcPublicClient.waitForTransactionReceipt({ hash: releaseHash });
  console.log("release tx:", releaseHash);

  console.log(`\nDone. Released ${formatUnits(amount, network.usdcErc20Decimals)} USDC to the fulfiller.`);
  console.log(`Explorer: ${network.blockExplorer}/tx/${releaseHash}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
