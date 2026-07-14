import { generateKeyPairSync, createSign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "./circle.js";

function sign(privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"], body: string) {
  const signer = createSign("SHA256");
  signer.update(body);
  signer.end();
  return signer.sign(privateKey, "base64");
}

describe("verifyWebhookSignature", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const body = JSON.stringify({ notification: { state: "COMPLETE", refId: "obligation-1" } });

  it("accepts a signature produced over the exact raw body", () => {
    const signature = sign(privateKey, body);
    expect(verifyWebhookSignature(body, signature, publicKey)).toBe(true);
  });

  it("rejects a signature if the body was re-serialized (byte order changed)", () => {
    const signature = sign(privateKey, body);
    const reSerialized = JSON.stringify(JSON.parse(body), null, 2);
    expect(verifyWebhookSignature(reSerialized, signature, publicKey)).toBe(false);
  });

  it("rejects a signature produced by a different key", () => {
    const { privateKey: otherKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const signature = sign(otherKey, body);
    expect(verifyWebhookSignature(body, signature, publicKey)).toBe(false);
  });

  it("rejects a tampered body", () => {
    const signature = sign(privateKey, body);
    const tampered = body.replace("COMPLETE", "FAILED");
    expect(verifyWebhookSignature(tampered, signature, publicKey)).toBe(false);
  });
});
