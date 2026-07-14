import { GatewayClient } from "@circle-fin/x402-batching/client";

export interface FxRateResult {
  pair: string;
  rate: number;
  asOf: string;
  source: string;
  paymentTxHash: string;
  amountPaidUsdc: string;
}

interface RateResponse {
  pair: string;
  rate: number;
  asOf: string;
  source: string;
}

/**
 * Pays the x402-protected rate oracle (apps/oracle) a sub-cent nanopayment
 * via Circle Gateway and returns the FX rate it consulted. Gateway payments
 * sign directly with a raw key (viem), so this uses a dedicated throwaway
 * EOA — not the Circle-custodied treasury wallet, which can't sign like this.
 */
export async function payForFxRate(params: {
  oracleUrl: string;
  privateKey: `0x${string}`;
}): Promise<FxRateResult> {
  const client = new GatewayClient({ chain: "arcTestnet", privateKey: params.privateKey });
  const { data, transaction, formattedAmount } = await client.pay<RateResponse>(params.oracleUrl);
  return {
    pair: data.pair,
    rate: data.rate,
    asOf: data.asOf,
    source: data.source,
    paymentTxHash: transaction,
    amountPaidUsdc: formattedAmount,
  };
}
