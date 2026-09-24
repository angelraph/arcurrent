import {
  BaseError,
  ContractFunctionRevertedError,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from "viem";
import { MandateError } from "./errors.js";

export function revertReason(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError && revert.reason) return revert.reason;
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : String(err);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface TxRunnerOptions {
  explorerUrl: string;
  receiptPollMs: number;
  receiptTimeoutMs: number;
}

/**
 * Simulate, send, and confirm one transaction. Every write is simulated
 * first, so a call the contract would reject fails with a readable error and
 * costs no gas, and receipts are polled directly with getTransactionReceipt
 * against one endpoint, because Arc's public RPC can serve a block-filter
 * poll from a backend that has not indexed a fresh transaction yet.
 */
export class TxRunner {
  constructor(
    readonly publicClient: PublicClient,
    private readonly options: TxRunnerOptions
  ) {}

  explorerTxUrl(hash: Hex): string {
    return `${this.options.explorerUrl}/tx/${hash}`;
  }

  async send(
    wallet: WalletClient,
    simulate: () => Promise<{ request: unknown }>
  ): Promise<{ hash: Hex; receipt: TransactionReceipt }> {
    let request: unknown;
    try {
      ({ request } = await simulate());
    } catch (err) {
      throw new MandateError("CONTRACT_REVERT", `The contract would reject this call: ${revertReason(err)}`);
    }
    const hash = await wallet.writeContract(request as Parameters<WalletClient["writeContract"]>[0]);
    const receipt = await this.waitForReceipt(hash);
    return { hash, receipt };
  }

  async waitForReceipt(hash: Hex): Promise<TransactionReceipt> {
    const stopAt = Date.now() + this.options.receiptTimeoutMs;
    for (;;) {
      let receipt: TransactionReceipt | null = null;
      try {
        receipt = await this.publicClient.getTransactionReceipt({ hash });
      } catch {
        // Not indexed yet (or a transient RPC error): keep polling until the timeout.
      }
      if (receipt) {
        if (receipt.status === "reverted") {
          throw new MandateError("TX_REVERTED", `Transaction ${hash} was mined but reverted.`);
        }
        return receipt;
      }
      if (Date.now() >= stopAt) {
        throw new MandateError(
          "RECEIPT_TIMEOUT",
          `No receipt for ${hash} after ${this.options.receiptTimeoutMs} ms. It may still confirm; check ${this.explorerTxUrl(hash)}.`
        );
      }
      await sleep(this.options.receiptPollMs);
    }
  }
}
