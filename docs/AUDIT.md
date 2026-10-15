# Arcurrent security review

This is an **internal review**, done by the author with an AI coding assistant, using
automated tests, static analysis, a mutation check, a rehearsal on Arc testnet and
read-only checks against Arc mainnet. **It is not a professional third-party audit.**
The contracts hold a deliberately small balance for that reason.

It records three rounds:

1. **2026-09-23**: `MandateEscrow` (static analysis and a manual trust-model review).
2. **2026-09-24**: `AgentVault` (tests, fuzzing, a mutation check, static analysis and a
   real-chain rehearsal).
3. **2026-10-15**: the agent loop and the web routes that touch funds or secrets, plus the
   fixes found along the way (section 4).

The longer first two write-ups are in [STACK.md](STACK.md#security-self-review-mandateescrowsol-2026-09-23).
This document keeps the findings and what is still open in one place.

## 1. Scope: what Arcurrent owns and what it depends on

**Owned (in scope):**

| Component | Path | What could go wrong |
|---|---|---|
| MandateEscrow | `packages/contracts/contracts/MandateEscrow.sol` | funds stranded or released to the wrong party, reputation ledger manipulated |
| AgentVault | `packages/contracts/contracts/AgentVault.sol` | the operator exceeding the owner's limits, the owner locked out, funds stranded |
| SDK and MCP server | `packages/mandate-sdk`, `packages/mandate-mcp` | a wrong amount approved or sent, an agent given more authority than intended |
| Agent loop | `packages/shared/src/evaluate.ts`, `decide.ts`, `vault.ts` | paying the same obligation twice, paying a wrong address, looping on a bad row |
| Web routes | `apps/web/src/app/api/cron`, `api/circle/webhook`, `actions.ts` | an unauthenticated request moving money, a forged webhook, brute-forced owner passcode |

**Depended on (out of scope, external):**

- **Arc and its USDC precompile.** Gas is paid in USDC; the ERC-20 view is the same
  money. Arcurrent cannot change either.
- **Circle.** Wallet custody (the agent's signing wallet, which holds gas only), the
  transaction API and the signed webhooks. Circle can also freeze a USDC address.
- **Supabase** (the obligations and decision log), **Vercel** (hosting and cron) and the
  public Arc RPCs. A failure of any of them degrades the dashboard or pauses the agent;
  none of them can move vault funds, because the vault's rules are enforced on-chain.

`MandateEscrow` has **no owner and no admin**. `AgentVault` has an owner by design, and
the project **never holds the owner key**: the owner is a wallet the user controls.

## 2. Methodology

1. **Unit tests.** 52 contract tests (50 Solidity, 2 Node), 52 SDK tests, 32 MCP tests,
   41 for the shared agent logic and 26 for the web helpers. Run by CI on every push.
2. **Fuzzing.** Three fuzz suites on `AgentVault` (256 runs each): total spend never
   exceeds the starting cap plus refill over random sequences of payments and time
   jumps; no payment exceeds the per-payment cap; vault plus payee balances always sum to
   what was funded.
3. **Mutation check.** `AgentVault` was deliberately broken four ways (daily check
   removed, allowlist check removed, refill without the cap clamp, withdraw open to
   anyone). Each mutant was caught by the suite and the contract restored byte for byte.
4. **Static analysis.** `slither` 0.11.6 on both contracts: no reentrancy, access-control,
   unchecked-call or arithmetic findings. The only notes are the intended zero-address
   "disable" switches and second-granularity timestamp comparisons.
5. **Real-chain rehearsal.** `scripts/vault-rehearsal.ts` deployed both contracts to Arc
   testnet with throwaway keys and ran 29 checks through the SDK, and
   `scripts/vault-mcp-e2e.ts` did the same through a real MCP server subprocess.
6. **Mainnet read-back.** The deployed source is verified on the explorer, and the live
   limits and balances are read from the contracts, not from this repository's database.
7. **Flow tests of the agent loop.** `evaluate.flow.test.ts` drives the real evaluation
   loop against fakes for the database and the vault: pay, hold, claim and release,
   confirmation not yet seen, and the bad-address case below.

## 3. Component analysis

### MandateEscrow

- `release()` is funder-gated and pays exactly what is locked: the destinations and
  amounts must sum to the mandate amount, so a funder can route funds anywhere but never
  move more or less than was escrowed.
- `refund()` only fires past the deadline and only from `Funded`, so a fulfiller who has
  already posted proof cannot be refunded out from under them.
- **No arbitration, by design.** A funder can still withhold release after proof. This is
  stated in the contract's own header comment and in the FAQ, not hidden.

### AgentVault

- The operator can call exactly one function, `pay(to, amount, ref)`, inside a
  per-payment cap, a daily cap, an optional payee allowlist and while unpaused. It cannot
  withdraw, change a rule, or pay the vault, the escrow or the token address.
- The daily cap is a continuously refilling token bucket, so there is no midnight at
  which a full cap can be spent twice in a row. Refill rounds down.
- A guardian can pause but never resume. Ownership moves in two steps and cannot be
  renounced. The owner can always withdraw, even while paused.

### Agent loop

- **Atomic claim.** A conditional `pending -> scheduled` update means two overlapping
  passes cannot both pay the same obligation.
- **No release-back after acceptance.** Once Circle has accepted a transaction the claim
  is never released for a retry, so a slow confirmation cannot become a double payment.
- **Pre-flight.** Before paying, the loop asks `vault.checkPay()`. A refusal becomes a
  logged hold and the obligation stays pending, rather than a reverted transaction.
- **Bad payees fail once.** An address that can never be valid is recorded once and the
  obligation is marked `failed` (finding 6).

### Web routes

- **Cron route** fails closed on a missing or wrong `CRON_SECRET`, since a real request
  here can move USDC.
- **Circle webhook** verifies `X-Circle-Signature` (ECDSA over the raw body) before
  trusting anything; malformed requests get a clean 401.
- **Add obligation** spends the project's treasury, so it needs the owner passcode, with
  a per-IP cooldown applied to every attempt, not only successful ones.
- **Owner panel** is wallet-gated and only ever asks the user's own wallet to sign.

## 4. Findings and resolutions

Severities are the author's own assessment.

| # | Date | Severity | Finding | Resolution |
|---|---|---|---|---|
| 1 | 2026-09-22 | Medium | The webhook route worked but was never registered with Circle: `WEBHOOK_ENDPOINT_URL` was documentation, not wiring, so obligations never moved from `scheduled` to `settled`. | **Fixed.** `scripts/setup-webhook.ts` registers the endpoint; verified live on a real settlement (`d78c258`). |
| 2 | 2026-09-23 | High | The public "Add obligation" form could queue a payment to any address that the agent would then pay from the real treasury. The per-IP cap only slowed bursts; it never restricted who could trigger a payout. | **Fixed.** The form requires an owner passcode, failing closed (`9b84833`). |
| 3 | 2026-09-24 | Low | Wrong passcode guesses were not rate limited, only successful submissions were. | **Fixed.** The per-IP cooldown now runs before the passcode check and records every attempt (`a6a50b4`). |
| 4 | 2026-09-24 | Medium | The earlier two-step payment path (approve, then create and release from the agent's own wallet) could be retried after a slow confirmation, and held the treasury in a hot wallet. | **Fixed.** Payments now go through `vault.pay()` in one transaction, the direct path was deleted, and an accepted payment is never released back for a retry (`95c11b8`). |
| 5 | 2026-10-02 | Low | A mistyped mixed-case payee address (checksum fails) was accepted by the form and failed later during evaluation. | **Fixed.** The form normalizes addresses and refuses mixed-case ones that fail EIP-55 (`f42b462`). |
| 6 | 2026-10-15 | Low | An obligation already stored with a bad checksum was re-evaluated and re-logged on every pass, forever. | **Fixed.** The loop checks the payee before deciding, records one "not retried" decision and marks the obligation `failed`. Covered by unit and flow tests (`979f32f`), and confirmed on a live pass. |
| 7 | 2026-10-15 | Info | Some decision rows held Circle's internal transaction id instead of a chain hash, so explorer links were dead, and evaluation errors were stored under `insufficient_funds` and read as a money problem. | **Fixed.** Only real `0x` hashes link to the explorer, evaluation errors are labelled as such, and stored hashes were backfilled from the chain. |

## 5. Test results (2026-10-15)

| Suite | Result |
|---|---|
| `packages/contracts` (Solidity and Node) | 52 passing |
| `packages/mandate-sdk` | 52 passing |
| `packages/mandate-mcp` | 32 passing |
| `packages/shared` (agent loop, vault module, address check) | 41 passing |
| `apps/web` (helpers) | 26 passing |
| Typecheck of the web app | clean |

## 6. Known limitations and open items

- **No professional audit.** No formal verification and no second independent reviewer.
  Keep balances small.
- **Vault payments do not yet backfill their chain hash.** The webhook only matches the
  Circle transaction id, so a new vault payment shows "waiting for confirmation" on the
  dashboard until it is looked up. The payment itself is unaffected and visible in the
  Mandates list. The fix is to read the hash from the vault's `Paid` event.
- **The agent cannot judge whether a payment is deserved.** A compromised operator can
  still spend up to the caps on payees the allowlist permits.
- **USDC is issued by Circle, which can freeze an address.** A frozen vault could not move
  funds. This is an issuer-level risk shared by every USDC holder.
- **One owner passcode.** It is a single shared secret with a per-IP cooldown, which is
  spam resistance, not full access control. It protects only the demo obligation form.
- **Cross-chain top-up is disabled on mainnet** until a Live-environment source wallet is
  funded. `request_liquidity` stays a flag-only decision.
- **No independent caller yet.** `MandateEscrow` is open to any address, but every
  mandate so far was created by this project's own wallets.
- **The vault's `forceApprove` against the USDC precompile** was only observed on testnet
  before deployment. Mainnet vault payments (mandates #6 and #7) have since succeeded.
