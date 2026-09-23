import { config } from "dotenv";
config({ path: ".env" });
import { createWalletClient, http, parseAbi, parseUnits, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcPublicClient, getActiveArcNetwork } from "@arcurrent/shared";

/**
 * Proves the one MandateEscrow capability mandate-demo.ts doesn't: an
 * atomic multi-destination release. Single wallet plays both funder and
 * fulfiller (self-submits its own proof) so no second throwaway key is
 * needed; release() then splits the payout between that wallet and the
 * rate-oracle's seller address, standing in for a real "fulfiller payout +
 * platform fee" split in one transaction.
 */
const mandateEscrowAbi = parseAbi([
  "function createMandate(address fulfiller, uint256 amount, uint256 deadline) returns (uint256)",
  "function submitProof(uint256 mandateId, bytes32 proofHash)",
  "function release(uint256 mandateId, address[] destinations, uint256[] amounts)",
  "function nextMandateId() view returns (uint256)",
]);
const erc20Abi = parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]);

/**
 * viem's waitForTransactionReceipt kept timing out against this RPC even
 * though the tx had already confirmed (getTransactionReceipt found it
 * immediately) -- an RPC polling quirk, not an actual failure. Plain
 * getTransactionReceipt in a retry loop sidesteps whatever that mismatch is.
 */
async function waitForReceipt(hash: `0x${string}`, attempts = 60, delayMs = 5000) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await arcPublicClient.getTransactionReceipt({ hash });
    } catch {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(`Receipt for ${hash} not found after ${attempts} attempts.`);
}

async function main() {
  const escrowAddress = process.env.MANDATE_ESCROW_ADDRESS as `0x${string}` | undefined;
  const funderKey = process.env.ARC_MAINNET_DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined;
  const feeRecipient = process.env.ORACLE_SELLER_ADDRESS as `0x${string}` | undefined;
  if (!escrowAddress || !funderKey || !feeRecipient) {
    throw new Error("MANDATE_ESCROW_ADDRESS, ARC_MAINNET_DEPLOYER_PRIVATE_KEY, and ORACLE_SELLER_ADDRESS must be set.");
  }

  const network = getActiveArcNetwork();
  const chain = {
    id: network.chainId,
    name: network.name,
    nativeCurrency: network.nativeCurrency,
    rpcUrls: { default: { http: [network.rpcUrls.default] } },
  };
  const transport = http(network.rpcUrls.default);
  const wallet = createWalletClient({ account: privateKeyToAccount(funderKey), chain, transport });

  const total = parseUnits("0.06", network.usdcErc20Decimals);
  const fulfillerShare = parseUnits("0.04", network.usdcErc20Decimals);
  const feeShare = total - fulfillerShare;

  console.log(`Network: ${network.name} (chain ${network.chainId})`);
  console.log(`Funder / fulfiller: ${wallet.account.address}`);
  console.log(`Fee recipient:      ${feeRecipient}`);
  console.log(`Total: ${formatUnits(total, network.usdcErc20Decimals)} USDC -> fulfiller ${formatUnits(fulfillerShare, network.usdcErc20Decimals)}, fee ${formatUnits(feeShare, network.usdcErc20Decimals)}`);

  const approveHash = await wallet.writeContract({
    address: network.usdcErc20Address,
    abi: erc20Abi,
    functionName: "approve",
    args: [escrowAddress, total],
  });
  await waitForReceipt(approveHash);
  console.log("approve tx:", approveHash);

  const createHash = await wallet.writeContract({
    address: escrowAddress,
    abi: mandateEscrowAbi,
    functionName: "createMandate",
    args: [wallet.account.address, total, 0n],
  });
  await waitForReceipt(createHash);
  console.log("createMandate tx:", createHash);

  const nextId = await arcPublicClient.readContract({
    address: escrowAddress,
    abi: mandateEscrowAbi,
    functionName: "nextMandateId",
  });
  const mandateId = nextId - 1n;
  console.log("mandateId:", mandateId.toString());

  const proofHash = await wallet.writeContract({
    address: escrowAddress,
    abi: mandateEscrowAbi,
    functionName: "submitProof",
    args: [mandateId, `0x${Buffer.from("arc-microgrants-split-demo").toString("hex").padEnd(64, "0")}` as `0x${string}`],
  });
  await waitForReceipt(proofHash);
  console.log("submitProof tx:", proofHash);

  const releaseHash = await wallet.writeContract({
    address: escrowAddress,
    abi: mandateEscrowAbi,
    functionName: "release",
    args: [mandateId, [wallet.account.address, feeRecipient], [fulfillerShare, feeShare]],
  });
  await waitForReceipt(releaseHash);
  console.log("release tx (atomic split):", releaseHash);

  console.log(`\nDone. Explorer: ${network.blockExplorer}/tx/${releaseHash}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
