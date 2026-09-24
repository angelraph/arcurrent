# @arcurrent/mandate-sdk

A typed client for **MandateEscrow**, the open, permissionless escrow and reputation contract live on Arc mainnet at [`0xca901f58fb82FE5FF459264a419b8cF8c75b3371`](https://explorer.arc.io/address/0xca901f58fb82FE5FF459264a419b8cF8c75b3371?tab=contract) (source verified).

Anyone can fund a mandate for anyone (or leave it open), a fulfiller posts a hash of their proof, and the funder releases the USDC atomically, optionally split across several addresses in one transaction. Every outcome updates an on-chain reputation ledger per address. There is no owner and no fee.

You do not need to be an "Arc project" to use it: any script or agent can call it as long as the transaction is sent to Arc mainnet (a wallet with a little USDC for gas).

> Status: lives in this monorepo and is not published to npm yet. Until it is, build it from the repo (`npm install && npm run build -w @arcurrent/mandate-sdk`) and depend on the workspace.

## Quickstart

```ts
import { MandateClient } from "@arcurrent/mandate-sdk";

// Read-only: no wallet, no key.
const reader = new MandateClient();
const mandate = await reader.getMandate(4);        // null if the id does not exist
const rep = await reader.reputationOf("0xFde19f3BCd5482544ce672391d839a56dA96BFEE");

// Read-write: use a dedicated, low-balance wallet for anything autonomous.
const client = MandateClient.fromPrivateKey(process.env.PRIVATE_KEY as `0x${string}`, {
  maxAmountUsdc: "25", // hard ceiling per createMandate
});

// 1. Lock USDC for a fulfiller (omit `fulfiller` to leave it open, omit `deadline` for no refund path).
const { mandateId } = await client.createMandate({
  amountUsdc: "10",
  fulfiller: "0xFulfillerAddress",
  deadline: { days: 14 },
});

// 2. The fulfiller posts proof (as text, which is hashed, or a ready-made 32-byte hash).
await fulfillerClient.submitProof(mandateId, { text: "https://example.com/delivered-work" });

// 3. The funder releases: whole amount to the fulfiller, or an atomic split.
await client.release(mandateId);
await client.release(mandateId, {
  splits: [
    { to: "0xFulfillerAddress", amountUsdc: "9.5" },
    { to: "0xFeeAddress", amountUsdc: "0.5" },
  ],
});

// Or, if nobody delivered before the deadline:
await client.refund(mandateId);
```

## API

| Method | Needs wallet | What it does |
|---|---|---|
| `getMandate(id)` | no | One mandate, or `null`. |
| `listMandates({ limit, offset })` | no | Newest first. |
| `reputationOf(address)` | no | `{ completed, refunded, volumeSettled }` from the contract's ledger. |
| `verifyProof(id, evidenceText)` | no | Does this text hash to the proof committed on-chain? |
| `createMandate({ amountUsdc, fulfiller?, deadline? })` | yes | Approves the exact amount if needed, then locks it. Returns the new id, read from this transaction's own event. |
| `submitProof(id, { text } \| { hash })` | yes | As the designated fulfiller, or first caller on an open mandate. |
| `release(id, { splits? })` | yes | Funder only. Splits must sum exactly to the locked amount. |
| `refund(id)` | yes | After the deadline, if no proof was posted. |

Helpers: `parseUsdc`, `formatUsdc`, `hashProof`, `resolveSplits`, plus the raw `mandateEscrowAbi`, `ARC_MAINNET` and `arcMainnetChain` for wiring into other viem code.

## Built for callers that cannot afford surprises

- **Spend cap.** `maxAmountUsdc` rejects any single `createMandate` above it before any read or transaction.
- **Exact-amount approvals.** The escrow is approved for exactly what a mandate needs, not unlimited, unless you pass `approveMax: true`.
- **Simulate first.** Every write is simulated, so a call the contract would reject (wrong caller, wrong status, deadline not reached) fails with a readable error and costs no gas.
- **Strict amounts.** `"1e3"`, negative numbers, and more than 6 decimals are rejected, never rounded.
- **Race-proof ids.** The contract is permissionless, so guessing the id from `nextMandateId()` could return someone else's mandate. The id comes from the `MandateCreated` event in your own receipt, matched on your address.
- **Stable error codes.** Failures are `MandateError` with a `code` (`AMOUNT_OVER_CAP`, `NOT_AUTHORIZED`, `WRONG_STATUS`, `DEADLINE_NOT_REACHED`, `INSUFFICIENT_BALANCE`, `CONTRACT_REVERT`, ...) you can branch on.
- **Receipt polling that works on Arc.** Arc's public RPC can serve a block-filter poll from a backend that has not indexed a fresh transaction yet, so `waitForTransactionReceipt` can hang on a transaction that already confirmed. The SDK polls `getTransactionReceipt` directly against one endpoint instead.

## Trust model, stated plainly

The funder's release is the only condition. There is no oracle judging the work and no arbitration: a funder can withhold release after a fulfiller has posted proof, and the contract offers no recourse for that. Reputation records outcomes, it does not prevent bad behaviour. The contract is self-reviewed (static analysis plus unit tests) but not professionally audited; keep amounts proportionate.
