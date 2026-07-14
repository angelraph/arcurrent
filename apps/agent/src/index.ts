import "dotenv/config";

/**
 * Arcurrent treasury agent entrypoint.
 * Loop: fetch due obligations -> evaluate signals -> decide -> execute -> log.
 * Each stage is a separate module so the decision logic stays testable in isolation
 * from the Circle SDK calls.
 */
async function main() {
  console.log("Arcurrent agent starting (stub) — decision loop not yet implemented.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
