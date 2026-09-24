import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  http,
  isAddress,
  keccak256,
  stringToHex,
  type Chain,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ARC_MAINNET, agentVaultAbi, arcMainnetChain, ZERO_ADDRESS, ZERO_HASH } from "./constants.js";
import { MandateError } from "./errors.js";
import { TxRunner } from "./tx.js";
import type { TxResult, VaultPayCheck, VaultPayParams, VaultPayResult, VaultPolicy } from "./types.js";
import { formatUsdc, parseUsdc } from "./usdc.js";

const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export interface VaultClientOptions {
  vaultAddress: `0x${string}`;
  publicClient?: PublicClient;
  /** Needed only for writes. Must have an account attached. */
  walletClient?: WalletClient;
  /** Defaults to Arc mainnet. */
  chain?: Chain;
  rpcUrl?: string;
  usdcDecimals?: number;
  receiptPollMs?: number;
  receiptTimeoutMs?: number;
}

function assertAddress(value: string, label: string): `0x${string}` {
  if (!isAddress(value, { strict: false })) {
    throw new MandateError("INVALID_ADDRESS", `${label} "${value}" is not a valid 0x address.`);
  }
  return value as `0x${string}`;
}

/** A 32-byte hex string is used as-is; anything else is hashed. Empty means no tag. */
function toRef(ref: string | undefined): Hex {
  if (!ref) return ZERO_HASH;
  return HASH_PATTERN.test(ref) ? (ref as Hex) : keccak256(stringToHex(ref));
}

/**
 * Client for an AgentVault: a treasury that lets an agent (the operator) pay
 * only inside limits a human (the owner) set. The operator methods (`pay`,
 * `checkPay`) are for the agent; the owner methods change the rules or move
 * funds and must be signed by the owner wallet. Reads need no wallet.
 *
 * `checkPay` never throws and never spends gas: it answers "would this
 * payment go through right now, and if not, why", so an agent can decide to
 * wait or ask its owner instead of sending a transaction that will revert.
 */
export class VaultClient {
  readonly publicClient: PublicClient;
  readonly walletClient: WalletClient | undefined;
  readonly vaultAddress: `0x${string}`;
  readonly usdcDecimals: number;
  private readonly tx: TxRunner;

  constructor(options: VaultClientOptions) {
    this.vaultAddress = assertAddress(options.vaultAddress, "Vault address");
    const chain = options.chain ?? arcMainnetChain;
    this.usdcDecimals = options.usdcDecimals ?? ARC_MAINNET.usdcDecimals;
    this.publicClient =
      options.publicClient ??
      (createPublicClient({ chain, transport: http(options.rpcUrl ?? chain.rpcUrls.default.http[0]) }) as PublicClient);
    this.walletClient = options.walletClient;
    this.tx = new TxRunner(this.publicClient, {
      explorerUrl: chain.blockExplorers?.default.url ?? ARC_MAINNET.explorerUrl,
      receiptPollMs: options.receiptPollMs ?? 2000,
      receiptTimeoutMs: options.receiptTimeoutMs ?? 120_000,
    });
  }

  static fromPrivateKey(privateKey: Hex, options: Omit<VaultClientOptions, "walletClient">): VaultClient {
    const chain = options.chain ?? arcMainnetChain;
    const walletClient = createWalletClient({
      account: privateKeyToAccount(privateKey),
      chain,
      transport: http(options.rpcUrl ?? chain.rpcUrls.default.http[0]),
    });
    return new VaultClient({ ...options, walletClient });
  }

  get address(): `0x${string}` | undefined {
    return this.walletClient?.account?.address;
  }

  explorerTxUrl(hash: Hex): string {
    return this.tx.explorerTxUrl(hash);
  }

  // ---------------------------------------------------------------- reads

  /** Every rule and the live balance, in one call. */
  async getPolicy(): Promise<VaultPolicy> {
    const p = await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: agentVaultAbi,
      functionName: "policy",
    });
    const d = this.usdcDecimals;
    return {
      owner: p.owner,
      operator: p.operator,
      guardian: p.guardian,
      perPaymentCap: p.perPaymentCap,
      perPaymentCapUsdc: formatUsdc(p.perPaymentCap, d),
      dailyCap: p.dailyCap,
      dailyCapUsdc: formatUsdc(p.dailyCap, d),
      available: p.available,
      availableUsdc: formatUsdc(p.available, d),
      allowlistRequired: p.allowlistRequired,
      paused: p.paused,
      balance: p.balance,
      balanceUsdc: formatUsdc(p.balance, d),
    };
  }

  async isPayeeAllowed(address: string): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.vaultAddress,
      abi: agentVaultAbi,
      functionName: "isAllowedPayee",
      args: [assertAddress(address, "Payee")],
    });
  }

  /** The escrow and USDC addresses the vault was deployed against. */
  async getWiring(): Promise<{ escrow: `0x${string}`; usdc: `0x${string}` }> {
    const [escrow, usdc] = await Promise.all([
      this.publicClient.readContract({ address: this.vaultAddress, abi: agentVaultAbi, functionName: "escrow" }),
      this.publicClient.readContract({ address: this.vaultAddress, abi: agentVaultAbi, functionName: "usdc" }),
    ]);
    return { escrow, usdc };
  }

  /**
   * Would `pay` succeed right now? Mirrors every rule the contract enforces
   * against live on-chain state, without sending anything. On a refusal the
   * message says what to do about it, including how long until the daily
   * allowance covers the amount.
   */
  async checkPay(params: { to: string; amountUsdc: string }, operator?: `0x${string}`): Promise<VaultPayCheck> {
    let amount: bigint;
    let to: `0x${string}`;
    try {
      amount = parseUsdc(params.amountUsdc, this.usdcDecimals);
      to = assertAddress(params.to, "Payee");
    } catch (err) {
      if (err instanceof MandateError) return { ok: false, code: err.code, message: err.message };
      throw err;
    }
    if (amount <= 0n) return { ok: false, code: "INVALID_AMOUNT", message: "The amount must be greater than zero." };

    const [policy, wiring] = await Promise.all([this.getPolicy(), this.getWiring()]);
    const caller = operator ?? this.address;
    if (caller && policy.operator.toLowerCase() !== caller.toLowerCase()) {
      return { ok: false, code: "NOT_AUTHORIZED", message: `${caller} is not this vault's operator (${policy.operator}).` };
    }
    if (policy.paused) {
      return { ok: false, code: "PAUSED", message: "The vault is paused. Only its owner can resume payments." };
    }
    const lower = to.toLowerCase();
    if (
      lower === ZERO_ADDRESS ||
      lower === this.vaultAddress.toLowerCase() ||
      lower === wiring.escrow.toLowerCase() ||
      lower === wiring.usdc.toLowerCase()
    ) {
      return { ok: false, code: "INVALID_PAYEE", message: `${to} cannot be paid: it would strand the funds instead of delivering them.` };
    }
    if (amount > policy.perPaymentCap) {
      return {
        ok: false,
        code: "OVER_PER_PAYMENT_CAP",
        message: `${params.amountUsdc} USDC is over the vault's per-payment cap of ${policy.perPaymentCapUsdc} USDC. Only the owner can raise it.`,
      };
    }
    if (policy.allowlistRequired && !(await this.isPayeeAllowed(to))) {
      return {
        ok: false,
        code: "PAYEE_NOT_ALLOWED",
        message: `${to} is not on the vault's payee allowlist. The owner has to approve it before the agent can pay it.`,
      };
    }
    if (amount > policy.available) {
      const missing = amount - policy.available;
      const waitSeconds = policy.dailyCap > 0n ? Number((missing * 86_400n + policy.dailyCap - 1n) / policy.dailyCap) : Infinity;
      return {
        ok: false,
        code: "OVER_DAILY_ALLOWANCE",
        message: `Only ${policy.availableUsdc} USDC of the daily allowance is available right now (cap ${policy.dailyCapUsdc} USDC per day, refilling continuously). It will cover ${params.amountUsdc} USDC in about ${Math.ceil(waitSeconds / 60)} minute(s).`,
      };
    }
    if (amount > policy.balance) {
      return {
        ok: false,
        code: "INSUFFICIENT_BALANCE",
        message: `The vault holds ${policy.balanceUsdc} USDC, less than the ${params.amountUsdc} USDC requested. The owner has to top it up.`,
      };
    }
    return { ok: true };
  }

  // ------------------------------------------------------------- operator

  /**
   * Pays `to` through the vault as one atomic mandate (created and released
   * in the same transaction). Refuses up front, with a readable error, if the
   * vault's rules would reject it.
   */
  async pay(params: VaultPayParams): Promise<VaultPayResult> {
    const wallet = this.requireWallet();
    const check = await this.checkPay(params, wallet.address);
    if (!check.ok) throw new MandateError(check.code, check.message);

    const amount = parseUsdc(params.amountUsdc, this.usdcDecimals);
    const { hash, receipt } = await this.tx.send(wallet.client, () =>
      this.publicClient.simulateContract({
        address: this.vaultAddress,
        abi: agentVaultAbi,
        functionName: "pay",
        args: [params.to, amount, toRef(params.ref)],
        account: wallet.account,
      })
    );
    const mandateId = this.findPaidId(receipt);
    if (mandateId === null) {
      throw new MandateError("EVENT_NOT_FOUND", `Transaction ${hash} confirmed but no Paid event from the vault was found.`);
    }
    return { mandateId, hash, explorerUrl: this.explorerTxUrl(hash) };
  }

  // ---------------------------------------------------------------- owner

  async setLimits(limits: { perPaymentUsdc: string; dailyUsdc: string }): Promise<TxResult> {
    const perPayment = parseUsdc(limits.perPaymentUsdc, this.usdcDecimals);
    const daily = parseUsdc(limits.dailyUsdc, this.usdcDecimals);
    if (perPayment <= 0n) throw new MandateError("INVALID_AMOUNT", "The per-payment cap must be greater than zero.");
    if (daily < perPayment) throw new MandateError("INVALID_AMOUNT", "The daily cap must be at least the per-payment cap.");
    return this.ownerSend((account) =>
      this.publicClient.simulateContract({ address: this.vaultAddress, abi: agentVaultAbi, functionName: "setLimits", args: [perPayment, daily], account })
    );
  }

  async setAllowlistRequired(required: boolean): Promise<TxResult> {
    return this.ownerSend((account) =>
      this.publicClient.simulateContract({ address: this.vaultAddress, abi: agentVaultAbi, functionName: "setAllowlistRequired", args: [required], account })
    );
  }

  async setPayee(payee: string, allowed: boolean): Promise<TxResult> {
    const who = assertAddress(payee, "Payee");
    return this.ownerSend((account) =>
      this.publicClient.simulateContract({ address: this.vaultAddress, abi: agentVaultAbi, functionName: "setPayee", args: [who, allowed], account })
    );
  }

  async setPayees(payees: string[], allowed: boolean): Promise<TxResult> {
    const list = payees.map((p) => assertAddress(p, "Payee"));
    if (list.length === 0) throw new MandateError("INVALID_ADDRESS", "Pass at least one payee.");
    return this.ownerSend((account) =>
      this.publicClient.simulateContract({ address: this.vaultAddress, abi: agentVaultAbi, functionName: "setPayees", args: [list, allowed], account })
    );
  }

  /** Pass null to remove the operator, which freezes payments until a new one is set. */
  async setOperator(operator: string | null): Promise<TxResult> {
    const who = operator === null ? ZERO_ADDRESS : assertAddress(operator, "Operator");
    return this.ownerSend((account) =>
      this.publicClient.simulateContract({ address: this.vaultAddress, abi: agentVaultAbi, functionName: "setOperator", args: [who], account })
    );
  }

  /** The guardian can pause but never resume. Pass null to remove it. */
  async setGuardian(guardian: string | null): Promise<TxResult> {
    const who = guardian === null ? ZERO_ADDRESS : assertAddress(guardian, "Guardian");
    return this.ownerSend((account) =>
      this.publicClient.simulateContract({ address: this.vaultAddress, abi: agentVaultAbi, functionName: "setGuardian", args: [who], account })
    );
  }

  /** Callable by the owner or the guardian. */
  async pause(): Promise<TxResult> {
    const wallet = this.requireWallet();
    const [owner, guardian] = await Promise.all([
      this.publicClient.readContract({ address: this.vaultAddress, abi: agentVaultAbi, functionName: "owner" }),
      this.publicClient.readContract({ address: this.vaultAddress, abi: agentVaultAbi, functionName: "guardian" }),
    ]);
    const me = wallet.address.toLowerCase();
    if (me !== owner.toLowerCase() && me !== guardian.toLowerCase()) {
      throw new MandateError("NOT_AUTHORIZED", "Only the vault's owner or guardian can pause it.");
    }
    const { hash } = await this.tx.send(wallet.client, () =>
      this.publicClient.simulateContract({ address: this.vaultAddress, abi: agentVaultAbi, functionName: "pause", account: wallet.account })
    );
    return { hash, explorerUrl: this.explorerTxUrl(hash) };
  }

  async unpause(): Promise<TxResult> {
    return this.ownerSend((account) =>
      this.publicClient.simulateContract({ address: this.vaultAddress, abi: agentVaultAbi, functionName: "unpause", account })
    );
  }

  /** Works even while the vault is paused. */
  async withdraw(to: string, amountUsdc: string): Promise<TxResult> {
    const dest = assertAddress(to, "Destination");
    const amount = parseUsdc(amountUsdc, this.usdcDecimals);
    if (amount <= 0n) throw new MandateError("INVALID_AMOUNT", "The amount must be greater than zero.");
    const policy = await this.getPolicy();
    if (amount > policy.balance) {
      throw new MandateError("INSUFFICIENT_BALANCE", `The vault holds ${policy.balanceUsdc} USDC, less than the ${amountUsdc} USDC requested.`);
    }
    return this.ownerSend((account) =>
      this.publicClient.simulateContract({ address: this.vaultAddress, abi: agentVaultAbi, functionName: "withdraw", args: [dest, amount], account })
    );
  }

  /** Step one of a two-step handover; the new owner must call acceptOwnership. */
  async transferOwnership(newOwner: string): Promise<TxResult> {
    const who = assertAddress(newOwner, "New owner");
    return this.ownerSend((account) =>
      this.publicClient.simulateContract({ address: this.vaultAddress, abi: agentVaultAbi, functionName: "transferOwnership", args: [who], account })
    );
  }

  async acceptOwnership(): Promise<TxResult> {
    const wallet = this.requireWallet();
    const pending = await this.publicClient.readContract({ address: this.vaultAddress, abi: agentVaultAbi, functionName: "pendingOwner" });
    if (pending.toLowerCase() !== wallet.address.toLowerCase()) {
      throw new MandateError("NOT_AUTHORIZED", `Only the pending owner (${pending}) can accept ownership.`);
    }
    const { hash } = await this.tx.send(wallet.client, () =>
      this.publicClient.simulateContract({ address: this.vaultAddress, abi: agentVaultAbi, functionName: "acceptOwnership", account: wallet.account })
    );
    return { hash, explorerUrl: this.explorerTxUrl(hash) };
  }

  // ------------------------------------------------------------ internals

  private requireWallet() {
    const client = this.walletClient;
    const account = client?.account;
    if (!client || !account) {
      throw new MandateError("NO_WALLET", "This client has no wallet attached, so it can only read. Create it with VaultClient.fromPrivateKey(...) or pass a walletClient with an account.");
    }
    return { client, account, address: account.address };
  }

  private async ownerSend(
    simulate: (account: NonNullable<WalletClient["account"]>) => Promise<{ request: unknown }>
  ): Promise<TxResult> {
    const wallet = this.requireWallet();
    const owner = await this.publicClient.readContract({ address: this.vaultAddress, abi: agentVaultAbi, functionName: "owner" });
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      throw new MandateError("NOT_AUTHORIZED", `Only the vault's owner (${owner}) can do this; this wallet is ${wallet.address}.`);
    }
    const { hash } = await this.tx.send(wallet.client, () => simulate(wallet.account));
    return { hash, explorerUrl: this.explorerTxUrl(hash) };
  }

  private findPaidId(receipt: TransactionReceipt): bigint | null {
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== this.vaultAddress.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({ abi: agentVaultAbi, eventName: "Paid", topics: log.topics, data: log.data });
        return decoded.args.mandateId;
      } catch {
        // Not a Paid log; keep looking.
      }
    }
    return null;
  }
}
