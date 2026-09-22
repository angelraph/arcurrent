import { config } from "dotenv";
config({ path: ".env" });
import { getCircleClient } from "@arcurrent/shared";

/**
 * Registers (or lists) the Circle notification subscription that makes the
 * webhook route in apps/web/src/app/api/circle/webhook actually receive
 * anything -- WEBHOOK_ENDPOINT_URL alone was never enough, Circle has to be
 * told about the endpoint via this API.
 *   tsx scripts/setup-webhook.ts list
 *   tsx scripts/setup-webhook.ts create <endpointUrl>
 */
async function main() {
  const mode = process.argv[2];
  const circle = getCircleClient();

  if (mode === "list") {
    const res = await circle.listSubscriptions();
    console.log(JSON.stringify(res.data, null, 2));
    return;
  }

  if (mode === "create") {
    const endpoint = process.argv[3];
    if (!endpoint) throw new Error("Usage: tsx scripts/setup-webhook.ts create <endpointUrl>");
    const res = await circle.createSubscription({ endpoint });
    console.log(JSON.stringify(res.data, null, 2));
    return;
  }

  throw new Error('Pass "list" or "create <endpointUrl>" as an argument.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
