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
| Cross-chain liquidity | `@circle-fin/app-kit` (Bridge Kit) + Circle Gateway | `kit.bridge()` / `kit.estimateBridge()` |
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
- Agent (`apps/agent`) reads pending obligations from that same database, runs a
  deterministic decision function (`decide.ts`, unit-tested) against the escrow
  contract's real USDC balance, due date, and a configurable reserve floor, and — when
  it decides to pay — calls `ObligationEscrow.settle(obligationId, destination, amount)`
  as a contract-execution transaction via Circle's Developer-Controlled Wallets API, so
  settlement is a verifiable on-chain program action (with its own event log) rather
  than a bare wallet-to-wallet transfer. Reasoning + tx hash get written back to the
  database either way.
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

Known gaps, tracked rather than faked:
- **StableFX** is gated (RFQ access, no self-serve signup) — non-USDC obligations are
  correctly flagged `convert_currency` by the decision engine but not yet settled.
- **Cross-chain liquidity top-up (CCTP/Bridge Kit)** isn't wired in yet — obligations
  that would breach the reserve floor are flagged `request_liquidity` but not acted on.
- **Nanopayments** (agent-to-agent micropayment for the FX rate oracle) not yet built.

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
10. `npm run dev:web` — dashboard at `localhost:3000`.
11. `npm run dev:agent` — runs one evaluation pass over pending obligations.
