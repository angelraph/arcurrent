# Arcurrent

Autonomous cross-border treasury agent, built on [Arc](https://arc.io) — Circle's stablecoin-native L1.

Arcurrent watches a company's payment obligations, decides when and how to settle them
based on real signals (balance, due dates, FX rate movement), converts currency via
StableFX when a payment isn't USDC-denominated, sources liquidity across chains via
Circle Bridge Kit/Gateway when the Arc balance is short, and pays sub-cent nanopayment
fees to the rate oracle it consults before every decision — all without a human in the
loop, settling in USDC on Arc.

Built for the [Build on Arc](https://arc.io) hackathon — DeFi + Agentic Economy tracks.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Monorepo | npm workspaces | No extra tooling; pnpm hit a Windows/corepack permissions wall |
| Dashboard/API | Next.js (App Router) + Supabase | Mirrors Circle's own `arc-fintech` reference app |
| Agent | Node.js/TypeScript service (`apps/agent`) | Runs independently of the dashboard — autonomy means it isn't human-triggered |
| Wallets | `@circle-fin/developer-controlled-wallets` | Circle's real, self-serve wallet SDK |
| Cross-chain liquidity | `@circle-fin/app-kit` (Bridge Kit) via `@circle-fin/adapter-circle-wallets` | `kit.bridge()` signs through the same Circle-custodied wallets the rest of the app uses — no private key held for either side of the bridge |
| Nanopayments | `@circle-fin/x402-batching` (x402 protocol) | Real, self-serve, has a working Circle reference impl (`arc-nanopayments`) |
| FX conversion | StableFX (gated — see below) | Behind an adapter interface until access is granted |
| Contracts | Hardhat 3 + viem | Foundry's native Windows install path was too much friction for solo/4-week scope |

See [docs/STACK.md](docs/STACK.md) for the full verification notes (chain ID, RPC,
contract addresses, package versions — all independently confirmed against
docs.arc.io, chainlist.org, and the npm registry on 2026-07-14).

## Repo layout

```
apps/
  web/         Next.js dashboard + API routes + Circle webhooks
  agent/       Autonomous decision loop (reads obligations, decides, settles, logs)
  oracle/      x402-protected FX rate oracle — the agent pays it a sub-cent
               nanopayment via Circle Gateway before recording a convert_currency
               decision (real payment, real rate; StableFX itself stays gated)
packages/
  contracts/   Hardhat 3 project — ObligationEscrow.sol, a real deployed contract
               on Arc Testnet that holds the treasury's USDC and executes
               settlements on the agent's instruction (see Status below)
  shared/      Shared types + Arc network config used by web and agent
```

## Status

Core spine is real end-to-end, no mock data anywhere in the path:

- Dashboard (`apps/web`) lets a real user add an obligation (vendor, amount, currency,
  due date, destination address) via a Server Action into a real Postgres table
  (Supabase), and displays the live Circle treasury balance, the obligations list, and
  the agent's decision log with links to Arc Testnet Explorer.
- The evaluation loop (`packages/shared/src/evaluate.ts`, built on the unit-tested
  `decide.ts`) reads pending obligations, decides against the escrow contract's real
  USDC balance, due date, and a configurable reserve floor, and — when it decides to
  pay — calls `ObligationEscrow.settle(obligationId, destination, amount)` as a
  contract-execution transaction via Circle's Developer-Controlled Wallets API, so
  settlement is a verifiable on-chain program action (with its own event log) rather
  than a bare wallet-to-wallet transfer. Reasoning + tx hash get written back to the
  database either way. There's exactly one implementation of this loop, run from two
  places: `apps/agent` (standalone, for local/manual runs) and a Vercel Cron route
  (`apps/web/src/app/api/cron/evaluate`, for it to actually run autonomously once
  deployed — see `apps/web/vercel.json`). The route fails closed on a missing/wrong
  `CRON_SECRET`, since a real hit here moves real USDC.
- `ObligationEscrow.sol` (`packages/contracts`, deployed on Arc Testnet, unit-tested
  with a mock USDC in an isolated local EVM) holds the treasury's deposited USDC and
  only lets its owner (the treasury wallet) settle out of it — deposits and settlements
  both emit events, so the whole payment history is independently verifiable on-chain,
  not just in Postgres.
- A webhook route (`/api/circle/webhook`) moves an obligation from `scheduled` to
  `settled`/`failed` once Circle confirms the onchain transaction. Every request's
  `X-Circle-Signature` is verified (ECDSA-SHA256 over the raw body) before anything is
  trusted; unverified/malformed requests get a clean `401`, never a crash.
- When Circle/Supabase credentials aren't configured, the app fails loudly with a
  clear error rather than falling back to fake data — confirmed by running it with an
  empty `.env`.
- **Nanopayments**: when an obligation is denominated in EURC, the agent pays
  `apps/oracle`'s `/rate` route a real `$0.001` x402 payment (Circle Gateway,
  gas-free — settled off-chain as a signed authorization, batched on-chain later)
  and gets back a live EUR/USD rate from a real public rate provider (no mock data).
  The rate, source, and payment id are written into the decision's signals. This
  doesn't execute a conversion — that's still blocked on StableFX (see below) — it
  proves the agent-pays-for-a-service nanopayment flow end-to-end.

- **Cross-chain liquidity top-up**: when settling an obligation would drop the escrow
  balance below the reserve floor, the agent no longer just flags it — `packages/shared/src/liquidity.ts`
  bridges exactly the shortfall from a second Circle-custodied wallet on Base Sepolia into
  the Arc treasury wallet via Bridge Kit's `kit.bridge()` (real CCTP, both legs signed
  through `@circle-fin/adapter-circle-wallets` — no private key held for either wallet),
  then deposits the bridged USDC into `ObligationEscrow` (approve + deposit, same two
  Circle contract-execution transactions the manual setup step below documents). The
  obligation itself settles on the *next* evaluation pass, once the balance reflects the
  top-up — bridging plus a fast-mode CCTP attestation can run long enough that forcing it
  into the same pass isn't worth the complexity. Requires `LIQUIDITY_WALLET_ID`/
  `LIQUIDITY_WALLET_ADDRESS` to be set (see Setup); without them, `request_liquidity`
  falls back to the old flag-only behavior.

Known gaps, tracked rather than faked:
- **StableFX** is gated (RFQ access, no self-serve signup) — non-USDC obligations are
  correctly flagged `convert_currency` by the decision engine but not yet settled.

## Setup

1. `npm install` at the repo root (also builds `packages/shared`).
2. Copy `.env.example` to `.env`.
3. Create a Supabase project at [supabase.com](https://supabase.com), then run the
   migration in `supabase/migrations/` against it (`npx supabase db push` after
   `npx supabase link`), and fill in the Supabase values in `.env`.
4. Generate a Circle API key + entity secret at
   [console.circle.com](https://console.circle.com) and fill in `CIRCLE_API_KEY` /
   `CIRCLE_ENTITY_SECRET`.
5. `npm run setup:wallet` — creates the real treasury wallet on Arc Testnet and prints
   `TREASURY_WALLET_ID` / `TREASURY_WALLET_ADDRESS` to add to `.env`.
6. Fund that wallet from the [Circle faucet](https://faucet.circle.com) (select Arc Testnet).
7. Generate a throwaway deployer key (`generatePrivateKey()` from `viem/accounts`), fund
   it via the faucet, and set `ARC_TESTNET_DEPLOYER_PRIVATE_KEY` — this pays gas to
   deploy contracts and is separate from the Circle-custodied treasury wallet above.
8. `npm run deploy:obligation-escrow -w packages/contracts` — deploys `ObligationEscrow`
   to Arc Testnet and prints its address; set `OBLIGATION_ESCROW_ADDRESS` in `.env`.
9. Deposit USDC from the treasury wallet into the escrow (`approve` then `deposit`, both
   as Circle contract-execution transactions) before the agent can settle anything.
10. Generate a second throwaway EOA (`AGENT_X402_PRIVATE_KEY`) and an address-only
    `ORACLE_SELLER_ADDRESS` (no key needed — it only receives payments). Fund the
    x402 key with native gas + USDC via the faucet, then run
    `tsx scripts/deposit-gateway.ts <amount>` once to fund its Circle Gateway balance.
11. `npm run setup:liquidity-wallet` — creates the cross-chain liquidity wallet on Base
    Sepolia and prints `LIQUIDITY_WALLET_ID` / `LIQUIDITY_WALLET_ADDRESS` to add to
    `.env`. Fund it via the [Circle faucet](https://faucet.circle.com) (select Base
    Sepolia) — it needs **both** testnet ETH (gas for the CCTP burn call) and USDC (the
    amount to bridge). Confirmed the faucet does not reliably grant both from one request
    — request each explicitly and check the wallet's native balance before relying on it,
    since a USDC-only balance makes `kit.bridge()` hang instead of failing (there's a
    90s timeout guard around it in `liquidity.ts`, but that's a safety net, not a fix).
    Optional: without this, `request_liquidity` decisions are flagged but not acted on.
12. `npm run dev:oracle` — starts the rate oracle at `localhost:4000`.
13. `npm run dev:web` — dashboard at `localhost:3000`.
14. `npm run dev:agent` — runs one evaluation pass over pending obligations.

### Deploying (Vercel Cron for autonomous evaluation)

Deploy `apps/web` to Vercel (set its directory as the project root) with all the
`.env` values above as project env vars (including `LIQUIDITY_WALLET_ID`/
`LIQUIDITY_WALLET_ADDRESS` if you want autonomous liquidity top-ups, not just local
manual runs), plus a generated `CRON_SECRET`
(`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
`vercel.json` schedules `GET /api/cron/evaluate` every 15 minutes — check that
frequency against your actual Vercel plan's cron limits before relying on it.
Without this, the agent only evaluates obligations when someone runs
`npm run dev:agent`/`start` manually; with it, settlement genuinely runs with no
human in the loop.
