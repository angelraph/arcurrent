import "dotenv/config";
import {
  generateEntitySecret,
  registerEntitySecretCiphertext,
} from "@circle-fin/developer-controlled-wallets";

/**
 * Two-pass helper:
 *   tsx scripts/setup-entity-secret.ts generate   -> prints a new entity secret
 *   tsx scripts/setup-entity-secret.ts register    -> registers CIRCLE_ENTITY_SECRET from .env
 */
async function main() {
  const mode = process.argv[2];

  if (mode === "generate") {
    generateEntitySecret();
    return;
  }

  if (mode === "register") {
    const apiKey = process.env.CIRCLE_API_KEY;
    const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
    if (!apiKey) throw new Error("CIRCLE_API_KEY must be set in .env.");
    if (!entitySecret) throw new Error("CIRCLE_ENTITY_SECRET must be set in .env before registering.");

    const res = await registerEntitySecretCiphertext({ apiKey, entitySecret });
    console.log("Registered. Recovery file contents (also saved to disk):\n");
    console.log(res.data?.recoveryFile);
    return;
  }

  throw new Error('Pass "generate" or "register" as an argument.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
