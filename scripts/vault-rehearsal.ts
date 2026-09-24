import { config } from "dotenv";
config({ path: ".env" });
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWalletClient, http, parseAbi } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { ARC_TESTNET, arcTestnetChain, MandateClient, VaultClient, parseUsdc } from "../packages/mandate-sdk/src/index.js";

/**
 * A full rehearsal of AgentVault on Arc TESTNET with throwaway keys, driven
 * through the SDK against the real deployed contracts. Nothing here touches
 * mainnet or real funds.
 *
 *   npx tsx scripts/vault-rehearsal.ts prepare   generate operator/guardian keys, fund their gas,
 *                                                write the deploy parameters
 *   (deploy MandateEscrow and AgentVault with Hardhat Ignition, see the README of this script's
 *    caller in the repo's docs)
 *   npx tsx scripts/vault-rehearsal.ts run       attack every rule and report PASS/FAIL
 *
 * State (throwaway keys) lives in the OS temp dir, never in the repo.
 */
const STATE_FILE = join(tmpdir(), "vault-rehearsal.json");
const PARAMS_FILE = join(tmpdir(), "vault-params.json");
const erc20Abi = parseAbi(["function transfer(address to, uint256 amount) returns (bool)", "function balanceOf(address) view returns (uint256)"]);

interface State {
  operatorKey: `0x${string}`;
  guardianKey: `0x${string}`;
  operator: `0x${string}`;
  guardian: `0x${string}`;
  payee: `0x${string}`;
  strangerKey: `0x${string}`;
}

function ownerKey(): `0x${string}` {
  const key = process.env.ARC_TESTNET_DEPLOYER_PRIVATE_KEY;
  if (!key) throw new Error("ARC_TESTNET_DEPLOYER_PRIVATE_KEY is not set.");
  return key as `0x${string}`;
}

function wallet(key: `0x${string}`) {
  return createWalletClient({ account: privateKeyToAccount(key), chain: arcTestnetChain, transport: http(ARC_TESTNET.rpcUrl) });
}

async function waitFor(publicClient: MandateClient["publicClient"], hash: `0x${string}`) {
  for (let i = 0; i < 60; i++) {
    try {
      return await publicClient.getTransactionReceipt({ hash });
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error(`no receipt for ${hash}`);
}

async function prepare() {
  const operatorKey = generatePrivateKey();
  const guardianKey = generatePrivateKey();
  const strangerKey = generatePrivateKey();
  const state: State = {
    operatorKey,
    guardianKey,
    strangerKey,
    operator: privateKeyToAccount(operatorKey).address,
    guardian: privateKeyToAccount(guardianKey).address,
    payee: privateKeyToAccount(generatePrivateKey()).address,
  };
  writeFileSync(STATE_FILE, JSON.stringify(state));

  const owner = wallet(ownerKey());
  const reader = new MandateClient({ chain: arcTestnetChain, escrowAddress: "0x0000000000000000000000000000000000000001" });
  // On Arc, gas is USDC: give the operator and guardian a little to sign with.
  for (const to of [state.operator, state.guardian, privateKeyToAccount(strangerKey).address]) {
    const hash = await owner.writeContract({ address: ARC_TESTNET.usdcAddress, abi: erc20Abi, functionName: "transfer", args: [to, parseUsdc("1")] });
    await waitFor(reader.publicClient, hash);
  }
  console.log("Prepared. operator", state.operator, "guardian", state.guardian, "payee", state.payee);
  console.log("State written to", STATE_FILE);

  writeFileSync(
    PARAMS_FILE,
    JSON.stringify({
      AgentVaultModule: {
        escrowAddress: process.env.TESTNET_ESCROW ?? "FILL_ME",
        owner: privateKeyToAccount(ownerKey()).address,
        operator: state.operator,
        guardian: state.guardian,
        perPaymentCap: "1000000",
        dailyCap: "3000000",
        allowlistRequired: true,
      },
    })
  );
  console.log("Deploy params written to", PARAMS_FILE);
}

let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!pass) failures++;
}

async function run() {
  if (!existsSync(STATE_FILE)) throw new Error("Run `prepare` first.");
  const state = JSON.parse(readFileSync(STATE_FILE, "utf8")) as State;
  const escrowAddress = process.env.TESTNET_ESCROW as `0x${string}`;
  const vaultAddress = process.env.TESTNET_VAULT as `0x${string}`;
  if (!escrowAddress || !vaultAddress) throw new Error("Set TESTNET_ESCROW and TESTNET_VAULT to the deployed addresses.");

  const common = { chain: arcTestnetChain, receiptPollMs: 2000, receiptTimeoutMs: 120_000 };
  const owner = VaultClient.fromPrivateKey(ownerKey(), { vaultAddress, ...common });
  const operator = VaultClient.fromPrivateKey(state.operatorKey, { vaultAddress, ...common });
  const guardian = VaultClient.fromPrivateKey(state.guardianKey, { vaultAddress, ...common });
  const stranger = VaultClient.fromPrivateKey(state.strangerKey, { vaultAddress, ...common });
  const escrow = new MandateClient({ chain: arcTestnetChain, escrowAddress });
  const ownerWallet = wallet(ownerKey());

  const policy0 = await owner.getPolicy();
  check("deployed with the intended rules", policy0.operator.toLowerCase() === state.operator.toLowerCase() && policy0.perPaymentCapUsdc === "1" && policy0.dailyCapUsdc === "3" && policy0.allowlistRequired);
  const wiring = await owner.getWiring();
  check("wired to the right MandateEscrow", wiring.escrow.toLowerCase() === escrowAddress.toLowerCase());

  // Fund the vault the way a real owner would: a plain USDC transfer.
  const fundHash = await ownerWallet.writeContract({ address: ARC_TESTNET.usdcAddress, abi: erc20Abi, functionName: "transfer", args: [vaultAddress, parseUsdc("6")] });
  await waitFor(owner.publicClient, fundHash);
  check("the owner funds the vault with a plain transfer", (await owner.getPolicy()).balanceUsdc === "6");

  // Rule: allowlist. Refused by the SDK, and refused by the real contract if the SDK is bypassed.
  const notAllowed = await operator.checkPay({ to: state.payee, amountUsdc: "0.5" });
  check("an unlisted payee is refused up front", !notAllowed.ok && notAllowed.code === "PAYEE_NOT_ALLOWED");
  const bypass = await operator.publicClient.simulateContract({ address: vaultAddress, abi: [{ type: "function", name: "pay", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }, { name: "ref", type: "bytes32" }], outputs: [{ type: "uint256" }] }], functionName: "pay", args: [state.payee, 500_000n, `0x${"00".repeat(32)}`], account: state.operator }).then(() => "no revert", (e: Error) => e.message);
  check("the contract itself refuses it too", /payee not allowed/.test(bypass), bypass.slice(0, 80));
  await expectRefusal("a stranger cannot allowlist a payee", stranger.setPayee(state.payee, true), "NOT_AUTHORIZED");
  await expectRefusal("the operator cannot allowlist a payee", operator.setPayee(state.payee, true), "NOT_AUTHORIZED");

  await owner.setPayee(state.payee, true);
  check("the owner allowlists the payee", await owner.isPayeeAllowed(state.payee));

  // Happy path.
  const paid = await operator.pay({ to: state.payee, amountUsdc: "0.5", ref: "rehearsal-1" });
  check("the operator pays 0.5 USDC", paid.mandateId >= 0n, paid.explorerUrl);
  const mandate = await escrow.getMandate(paid.mandateId);
  check("it is a real Released mandate funded by the vault", mandate?.status === "Released" && mandate.funder.toLowerCase() === vaultAddress.toLowerCase() && mandate.fulfiller.toLowerCase() === state.payee.toLowerCase());
  const payeeBal = await escrow.publicClient.readContract({ address: ARC_TESTNET.usdcAddress, abi: erc20Abi, functionName: "balanceOf", args: [state.payee] });
  check("the payee received exactly 0.5 USDC", payeeBal === 500_000n);
  const rep = await escrow.reputationOf(state.payee);
  check("the payee's on-chain reputation was credited", rep.completed === 1 && rep.volumeSettledUsdc === "0.5");

  // Rule: per-payment cap.
  const overCap = await operator.checkPay({ to: state.payee, amountUsdc: "1.01" });
  check("over the per-payment cap is refused", !overCap.ok && overCap.code === "OVER_PER_PAYMENT_CAP");

  // Rule: daily cap. 3 USDC/day, 0.5 already spent: 1 + 1 fits (2.5 total), the next 1 does not.
  await operator.pay({ to: state.payee, amountUsdc: "1" });
  await operator.pay({ to: state.payee, amountUsdc: "1" });
  const exhausted = await operator.checkPay({ to: state.payee, amountUsdc: "1" });
  check("the daily cap runs out and the refusal says when it refills", !exhausted.ok && exhausted.code === "OVER_DAILY_ALLOWANCE", !exhausted.ok ? exhausted.message.slice(0, 90) : "");
  const afterSpend = await owner.getPolicy();
  check("available allowance reflects the spend", afterSpend.available < 1_000_000n + 600_000n);

  // Pause and guardian.
  await expectRefusal("the operator cannot pause", operator.pause(), "NOT_AUTHORIZED");
  await guardian.pause();
  check("the guardian can pause", (await owner.getPolicy()).paused);
  const paused = await operator.checkPay({ to: state.payee, amountUsdc: "0.1" });
  check("payments are refused while paused", !paused.ok && paused.code === "PAUSED");
  await expectRefusal("the guardian cannot resume", guardian.unpause(), "NOT_AUTHORIZED");
  const balanceBefore = (await owner.getPolicy()).balance;
  await owner.withdraw(privateKeyToAccount(ownerKey()).address, "0.25");
  check("the owner can still withdraw while paused", (await owner.getPolicy()).balance === balanceBefore - 250_000n);
  await owner.unpause();
  check("the owner resumes", !(await owner.getPolicy()).paused);

  // Operator rotation.
  await owner.setOperator(state.guardian);
  const oldOp = await operator.checkPay({ to: state.payee, amountUsdc: "0.1" });
  check("a rotated-out operator is refused", !oldOp.ok && oldOp.code === "NOT_AUTHORIZED");
  await owner.setOperator(state.operator);
  check("the owner restores the operator", (await owner.getPolicy()).operator.toLowerCase() === state.operator.toLowerCase());

  // Limits and allowlist toggle.
  await owner.setLimits({ perPaymentUsdc: "0.2", dailyUsdc: "1" });
  const lowered = await owner.getPolicy();
  check("lowering the limits clamps the allowance immediately", lowered.perPaymentCapUsdc === "0.2" && lowered.available <= 1_000_000n);

  // Two-step ownership.
  await owner.transferOwnership(state.guardian);
  check("ownership does not move until accepted", (await owner.getPolicy()).owner.toLowerCase() === privateKeyToAccount(ownerKey()).address.toLowerCase());
  await guardian.acceptOwnership();
  check("the new owner accepts", (await guardian.getPolicy()).owner.toLowerCase() === state.guardian.toLowerCase());
  await expectRefusal("the old owner is locked out", owner.setAllowlistRequired(false), "NOT_AUTHORIZED");
  await guardian.transferOwnership(privateKeyToAccount(ownerKey()).address);
  await owner.acceptOwnership();
  check("ownership handed back", (await owner.getPolicy()).owner.toLowerCase() === privateKeyToAccount(ownerKey()).address.toLowerCase());

  // Sweep the rest home.
  const left = (await owner.getPolicy()).balanceUsdc;
  await owner.withdraw(privateKeyToAccount(ownerKey()).address, left);
  check("the owner withdraws whatever is left", (await owner.getPolicy()).balance === 0n);

  console.log(failures === 0 ? "\nAll rehearsal checks passed." : `\n${failures} check(s) FAILED.`);
  if (failures > 0) process.exitCode = 1;
}

async function expectRefusal(label: string, attempt: Promise<unknown>, code: string) {
  try {
    await attempt;
    check(label, false, "it went through");
  } catch (err) {
    check(label, (err as { code?: string }).code === code, (err as { code?: string }).code);
  }
}

const phase = process.argv[2];
(phase === "prepare" ? prepare() : phase === "run" ? run() : Promise.reject(new Error("Usage: vault-rehearsal.ts prepare|run"))).catch((err) => {
  console.error(err);
  process.exit(1);
});
