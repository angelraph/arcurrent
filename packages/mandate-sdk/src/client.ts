import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  http,
  isAddress,
  type Chain,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ARC_MAINNET,
  arcMainnetChain,
  erc20Abi,
  mandateEscrowAbi,
  MANDATE_STATUSES,
  ZERO_ADDRESS,
  ZERO_HASH,
} from "./constants.js";
import { MandateError } from "./errors.js";
import { hashProof } from "./proof.js";
import { resolveSplits, type Split } from "./splits.js";
import type {
  CreateMandateParams,
  CreateMandateResult,
  Mandate,
  ProofInput,
  Reputation,
  TxResult,
} from "./types.js";
import { TxRunner } from "./tx.js";
import { formatUsdc, parseUsdc } from "./usdc.js";

const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const MAX_DEADLINE_DAYS = 3650;
const MAX_UINT256 = 2n ** 256n - 1n;
const LIST_CONCURRENCY = 8;

export interface MandateClientOptions {
  /** Bring your own read client, or omit and one is built from `rpcUrl`. */
  publicClient?: PublicClient;
  /** Needed only for writes. Must have an account attached. */
  walletClient?: WalletClient;
  /** Defaults to Arc mainnet. Pass another viem chain (e.g. Arc testnet) to point the client elsewhere. */
  chain?: Chain;
  rpcUrl?: string;
  escrowAddress?: `0x${string}`;
  usdcAddress?: `0x${string}`;
  usdcDecimals?: number;
  /**
   * Hard ceiling on a single createMandate, as a decimal USDC string. A guard
   * for autonomous callers: a confused agent can't lock more than this in one
   * call. Unset means no SDK-side cap (the contract itself has none).
   */
  maxAmountUsdc?: string;
  /** Approve the maximum allowance instead of the exact amount each time. Off by default. */
  approveMax?: boolean;
  receiptPollMs?: number;
  receiptTimeoutMs?: number;
}

function assertAddress(value: string, label: string): `0x${string}` {
  if (!isAddress(value, { strict: false })) {
    throw new MandateError("INVALID_ADDRESS", `${label} "${value}" is not a valid 0x address.`);
  }
  return value as `0x${string}`;
}

/**
 * Typed client for MandateEscrow. Reads work with just an RPC URL; writes need
 * a wallet. Every write is simulated first, so a call that would revert
 * (wrong caller, wrong status, deadline not reached) fails with a readable
 * MandateError before any gas is spent, and receipts are polled directly with
 * getTransactionReceipt against one endpoint, because Arc's public RPC can
 * serve block-filter polls from a backend that hasn't indexed a fresh tx yet.
 */
export class MandateClient {
  readonly publicClient: PublicClient;
  readonly walletClient: WalletClient | undefined;
  readonly escrowAddress: `0x${string}`;
  readonly usdcAddress: `0x${string}`;
  readonly usdcDecimals: number;
  private readonly maxAmount: bigint | null;
  private readonly approveMax: boolean;
  private readonly tx: TxRunner;
  private readonly chain: Chain;

  constructor(options: MandateClientOptions = {}) {
    this.escrowAddress = options.escrowAddress ?? ARC_MAINNET.mandateEscrowAddress;
    this.usdcAddress = options.usdcAddress ?? ARC_MAINNET.usdcAddress;
    this.usdcDecimals = options.usdcDecimals ?? ARC_MAINNET.usdcDecimals;
    this.chain = options.chain ?? arcMainnetChain;
    this.publicClient =
      options.publicClient ??
      (createPublicClient({
        chain: this.chain,
        transport: http(options.rpcUrl ?? this.chain.rpcUrls.default.http[0]),
      }) as PublicClient);
    this.walletClient = options.walletClient;
    this.maxAmount = options.maxAmountUsdc !== undefined ? parseUsdc(options.maxAmountUsdc, this.usdcDecimals) : null;
    this.approveMax = options.approveMax ?? false;
    this.tx = new TxRunner(this.publicClient, {
      explorerUrl: this.chain.blockExplorers?.default.url ?? ARC_MAINNET.explorerUrl,
      receiptPollMs: options.receiptPollMs ?? 2000,
      receiptTimeoutMs: options.receiptTimeoutMs ?? 120_000,
    });
  }

  /** Read-write client from a raw private key. Use a dedicated, low-balance wallet for agents. */
  static fromPrivateKey(privateKey: Hex, options: Omit<MandateClientOptions, "walletClient"> = {}): MandateClient {
    const account = privateKeyToAccount(privateKey);
    const chain = options.chain ?? arcMainnetChain;
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(options.rpcUrl ?? chain.rpcUrls.default.http[0]),
    });
    return new MandateClient({ ...options, walletClient });
  }

  /** The address writes are signed from, if a wallet is attached. */
  get address(): `0x${string}` | undefined {
    return this.walletClient?.account?.address;
  }

  explorerTxUrl(hash: Hex): string {
    return this.tx.explorerTxUrl(hash);
  }

  // ---------------------------------------------------------------- reads

  async nextMandateId(): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.escrowAddress,
      abi: mandateEscrowAbi,
      functionName: "nextMandateId",
    });
  }

  /** One mandate, or null if that id was never created. */
  async getMandate(id: bigint | number): Promise<Mandate | null> {
    const mandateId = BigInt(id);
    if (mandateId < 0n) throw new MandateError("NOT_FOUND", "Mandate ids are not negative.");
    const [funder, fulfiller, amount, deadline, proofHash, statusIndex] = await this.publicClient.readContract({
      address: this.escrowAddress,
      abi: mandateEscrowAbi,
      functionName: "mandates",
      args: [mandateId],
    });
    const status = MANDATE_STATUSES[statusIndex] ?? "None";
    if (status === "None") return null;
    return {
      id: mandateId,
      funder,
      fulfiller,
      isOpen: fulfiller.toLowerCase() === ZERO_ADDRESS,
      amount,
      amountUsdc: formatUsdc(amount, this.usdcDecimals),
      deadline: deadline === 0n ? null : Number(deadline),
      proofHash: proofHash === ZERO_HASH ? null : proofHash,
      status,
    };
  }

  /** Newest first. Reads one mandate per call (no event-log scan, which Arc's RPC caps at ~10k blocks). */
  async listMandates(options: { limit?: number; offset?: number } = {}): Promise<Mandate[]> {
    const limit = Math.max(1, Math.min(options.limit ?? 50, 500));
    const offset = Math.max(0, options.offset ?? 0);
    const total = Number(await this.nextMandateId());
    const newest = total - 1 - offset;
    if (newest < 0) return [];

    const ids: number[] = [];
    for (let id = newest; id >= 0 && ids.length < limit; id--) ids.push(id);

    const out: Mandate[] = [];
    for (let i = 0; i < ids.length; i += LIST_CONCURRENCY) {
      const batch = await Promise.all(ids.slice(i, i + LIST_CONCURRENCY).map((id) => this.getMandate(id)));
      for (const mandate of batch) if (mandate) out.push(mandate);
    }
    return out;
  }

  /** The on-chain reputation ledger entry for any address (all zeros if it has none). */
  async reputationOf(address: string): Promise<Reputation> {
    const who = assertAddress(address, "Address");
    const [completed, refunded, volumeSettled] = await this.publicClient.readContract({
      address: this.escrowAddress,
      abi: mandateEscrowAbi,
      functionName: "reputationOf",
      args: [who],
    });
    return {
      completed: Number(completed),
      refunded: Number(refunded),
      volumeSettled,
      volumeSettledUsdc: formatUsdc(volumeSettled, this.usdcDecimals),
    };
  }

  /** Does this evidence text hash to the proof committed on a mandate? Read-only, no wallet needed. */
  async verifyProof(id: bigint | number, evidence: string): Promise<{ matches: boolean; computed: Hex; onChain: Hex | null }> {
    const mandate = await this.getMandate(id);
    if (!mandate) throw new MandateError("NOT_FOUND", `Mandate #${id} does not exist.`);
    const computed = hashProof(evidence);
    return { matches: mandate.proofHash !== null && computed.toLowerCase() === mandate.proofHash.toLowerCase(), computed, onChain: mandate.proofHash };
  }

  // --------------------------------------------------------------- writes

  /**
   * Locks `amountUsdc` in a new mandate, approving the escrow first only if
   * the current allowance is too low. The mandate id comes from the
   * MandateCreated event in this transaction's own receipt (matched on this
   * funder), never from nextMandateId(): the contract is permissionless, so
   * someone else's create could land in between and hand back their id.
   */
  async createMandate(params: CreateMandateParams): Promise<CreateMandateResult> {
    const wallet = this.requireWallet();
    const amount = parseUsdc(params.amountUsdc, this.usdcDecimals);
    if (amount <= 0n) throw new MandateError("INVALID_AMOUNT", "The amount must be greater than zero.");
    if (this.maxAmount !== null && amount > this.maxAmount) {
      throw new MandateError(
        "AMOUNT_OVER_CAP",
        `${params.amountUsdc} USDC exceeds this client's cap of ${formatUsdc(this.maxAmount, this.usdcDecimals)} USDC per mandate.`
      );
    }
    const fulfiller = params.fulfiller ? assertAddress(params.fulfiller, "Fulfiller") : ZERO_ADDRESS;
    const deadline = this.resolveDeadline(params.deadline);

    const balance = await this.publicClient.readContract({
      address: this.usdcAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [wallet.address],
    });
    if (balance < amount) {
      throw new MandateError(
        "INSUFFICIENT_BALANCE",
        `Wallet ${wallet.address} holds ${formatUsdc(balance, this.usdcDecimals)} USDC, less than the ${params.amountUsdc} requested (Arc also pays gas in USDC, so keep a little spare).`
      );
    }

    const approval = await this.approveIfNeeded(amount);

    const { hash, receipt } = await this.tx.send(wallet.client, () =>
      this.publicClient.simulateContract({
        address: this.escrowAddress,
        abi: mandateEscrowAbi,
        functionName: "createMandate",
        args: [fulfiller, amount, deadline],
        account: wallet.account,
      })
    );

    const mandateId = this.findCreatedId(receipt, wallet.address);
    if (mandateId === null) {
      throw new MandateError("EVENT_NOT_FOUND", `Transaction ${hash} confirmed but no MandateCreated event for ${wallet.address} was found.`);
    }
    return { mandateId, hash, explorerUrl: this.explorerTxUrl(hash), approval };
  }

  /** Posts proof as the fulfiller (or as the first caller on an open mandate). */
  async submitProof(id: bigint | number, proof: ProofInput): Promise<TxResult> {
    const wallet = this.requireWallet();
    const mandate = await this.requireMandate(id);
    if (mandate.status !== "Funded") {
      throw new MandateError("WRONG_STATUS", `Mandate #${mandate.id} is ${mandate.status}; proof can only be posted while it is Funded.`);
    }
    if (!mandate.isOpen && mandate.fulfiller.toLowerCase() !== wallet.address.toLowerCase()) {
      throw new MandateError("NOT_AUTHORIZED", `Only the designated fulfiller ${mandate.fulfiller} can post proof on mandate #${mandate.id}.`);
    }
    let proofHash: Hex;
    if ("text" in proof) {
      if (!proof.text.trim()) throw new MandateError("INVALID_AMOUNT", "Proof text is empty.");
      proofHash = hashProof(proof.text);
    } else {
      if (!HASH_PATTERN.test(proof.hash) || proof.hash.toLowerCase() === ZERO_HASH) {
        throw new MandateError("INVALID_AMOUNT", "Proof hash must be a non-zero 32-byte hex string.");
      }
      proofHash = proof.hash;
    }

    const { hash } = await this.tx.send(wallet.client, () =>
      this.publicClient.simulateContract({
        address: this.escrowAddress,
        abi: mandateEscrowAbi,
        functionName: "submitProof",
        args: [mandate.id, proofHash],
        account: wallet.account,
      })
    );
    return { hash, explorerUrl: this.explorerTxUrl(hash) };
  }

  /**
   * Releases the locked funds, funder only. With no `splits` the whole amount
   * goes to the fulfiller; pass `splits` for an atomic multi-destination
   * payout (they must sum exactly to the locked amount). An open mandate that
   * nobody has claimed has no default recipient, so it requires `splits`.
   */
  async release(id: bigint | number, options: { splits?: Split[] } = {}): Promise<TxResult> {
    const wallet = this.requireWallet();
    const mandate = await this.requireMandate(id);
    if (mandate.funder.toLowerCase() !== wallet.address.toLowerCase()) {
      throw new MandateError("NOT_AUTHORIZED", `Only the funder ${mandate.funder} can release mandate #${mandate.id}.`);
    }
    if (mandate.status !== "Funded" && mandate.status !== "Fulfilled") {
      throw new MandateError("WRONG_STATUS", `Mandate #${mandate.id} is ${mandate.status}; it can no longer be released.`);
    }

    let splits = options.splits;
    if (!splits) {
      if (mandate.isOpen) {
        throw new MandateError("INVALID_SPLITS", `Mandate #${mandate.id} is open and unclaimed, so there is no default recipient: pass explicit splits.`);
      }
      splits = [{ to: mandate.fulfiller, amountUsdc: mandate.amountUsdc }];
    }
    const { destinations, amounts } = resolveSplits(splits, mandate.amount, this.usdcDecimals);

    const { hash } = await this.tx.send(wallet.client, () =>
      this.publicClient.simulateContract({
        address: this.escrowAddress,
        abi: mandateEscrowAbi,
        functionName: "release",
        args: [mandate.id, destinations, amounts],
        account: wallet.account,
      })
    );
    return { hash, explorerUrl: this.explorerTxUrl(hash) };
  }

  /** Returns an unproven mandate's funds to its funder once the deadline has passed. Anyone may call it. */
  async refund(id: bigint | number): Promise<TxResult> {
    const wallet = this.requireWallet();
    const mandate = await this.requireMandate(id);
    if (mandate.status !== "Funded") {
      throw new MandateError("WRONG_STATUS", `Mandate #${mandate.id} is ${mandate.status}; only a Funded mandate (no proof yet) can be refunded.`);
    }
    if (mandate.deadline === null) {
      throw new MandateError("WRONG_STATUS", `Mandate #${mandate.id} was created with no deadline, so it has no refund path.`);
    }
    if (Date.now() / 1000 < mandate.deadline) {
      throw new MandateError("DEADLINE_NOT_REACHED", `Mandate #${mandate.id} cannot be refunded before ${new Date(mandate.deadline * 1000).toISOString()}.`);
    }

    const { hash } = await this.tx.send(wallet.client, () =>
      this.publicClient.simulateContract({
        address: this.escrowAddress,
        abi: mandateEscrowAbi,
        functionName: "refund",
        args: [mandate.id],
        account: wallet.account,
      })
    );
    return { hash, explorerUrl: this.explorerTxUrl(hash) };
  }

  /** Tops the escrow's allowance up to `amount` if it is lower. Returns null when nothing was needed. */
  async approveIfNeeded(amount: bigint): Promise<TxResult | null> {
    const wallet = this.requireWallet();
    const allowance = await this.publicClient.readContract({
      address: this.usdcAddress,
      abi: erc20Abi,
      functionName: "allowance",
      args: [wallet.address, this.escrowAddress],
    });
    if (allowance >= amount) return null;

    const { hash } = await this.tx.send(wallet.client, () =>
      this.publicClient.simulateContract({
        address: this.usdcAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [this.escrowAddress, this.approveMax ? MAX_UINT256 : amount],
        account: wallet.account,
      })
    );
    return { hash, explorerUrl: this.explorerTxUrl(hash) };
  }

  // ------------------------------------------------------------- internals

  private requireWallet() {
    const client = this.walletClient;
    const account = client?.account;
    if (!client || !account) {
      throw new MandateError("NO_WALLET", "This client has no wallet attached, so it can only read. Create it with MandateClient.fromPrivateKey(...) or pass a walletClient with an account.");
    }
    return { client, account, address: account.address };
  }

  private async requireMandate(id: bigint | number): Promise<Mandate> {
    const mandate = await this.getMandate(id);
    if (!mandate) throw new MandateError("NOT_FOUND", `Mandate #${id} does not exist.`);
    return mandate;
  }

  private resolveDeadline(deadline: CreateMandateParams["deadline"]): bigint {
    if (!deadline) return 0n;
    if ("days" in deadline) {
      if (!Number.isInteger(deadline.days) || deadline.days < 1 || deadline.days > MAX_DEADLINE_DAYS) {
        throw new MandateError("INVALID_DEADLINE", `Deadline days must be a whole number between 1 and ${MAX_DEADLINE_DAYS}.`);
      }
      return BigInt(Math.floor(Date.now() / 1000) + deadline.days * 86400);
    }
    if (!Number.isInteger(deadline.unix) || deadline.unix <= Date.now() / 1000) {
      throw new MandateError("INVALID_DEADLINE", "Deadline unix time must be a whole number of seconds in the future.");
    }
    return BigInt(deadline.unix);
  }

  private findCreatedId(receipt: TransactionReceipt, funder: `0x${string}`): bigint | null {
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== this.escrowAddress.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({ abi: mandateEscrowAbi, eventName: "MandateCreated", topics: log.topics, data: log.data });
        if (decoded.args.funder.toLowerCase() === funder.toLowerCase()) return decoded.args.mandateId;
      } catch {
        // Not a MandateCreated log; keep looking.
      }
    }
    return null;
  }
}
