import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Monorepo root .env — dotenv/config alone loads from this workspace's own
// directory (apps/oracle), not the workspace root where the shared .env lives.
config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import express from "express";
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";

const PORT = Number(process.env.ORACLE_PORT ?? "4000");
const sellerAddress = process.env.ORACLE_SELLER_ADDRESS;
if (!sellerAddress) {
  throw new Error("ORACLE_SELLER_ADDRESS must be set.");
}

const app = express();

const gateway = createGatewayMiddleware({
  sellerAddress,
  // Arc Testnet, CAIP-2. Restricting to this network since that's the only
  // chain the agent's buyer key holds Gateway balance on.
  networks: ["eip155:5042002"],
  facilitatorUrl: "https://gateway-api-testnet.circle.com",
});

/**
 * Real ECB reference rate (api.frankfurter.dev — free, keyless, no mock data)
 * for the treasury agent to consult before deciding how to handle a
 * EUR-denominated obligation. The nanopayment is the point of this route —
 * the rate itself is informational only; StableFX access (gated, see
 * README) is what would actually execute a conversion.
 */
app.get("/rate", gateway.require("$0.001"), async (_req, res) => {
  const upstream = await fetch("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD");
  if (!upstream.ok) {
    res.status(502).json({ error: `Upstream rate provider returned ${upstream.status}` });
    return;
  }
  const body = (await upstream.json()) as { date: string; rates: { USD: number } };
  res.json({ pair: "EURUSD", rate: body.rates.USD, asOf: body.date, source: "api.frankfurter.dev" });
});

app.listen(PORT, () => {
  console.log(`Rate oracle listening on :${PORT} (seller ${sellerAddress})`);
});
