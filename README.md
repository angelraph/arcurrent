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
  contracts/   Hardhat 3 project — onchain obligation/escrow logic
  shared/      Shared types + Arc network config used by web and agent
```

## Status

Scaffolding stage — toolchain locked, no product logic written yet. Nothing in this
repo is mock data by design: the agent reads real obligations a real user enters
through the dashboard, and settles real testnet USDC on Arc. The one gated piece is
StableFX (RFQ-based, requires requesting access from Circle) — until that access
lands, the FX adapter is an interface with no implementation behind it, not a fake one.

## Setup

1. `npm install` at the repo root.
2. Copy `.env.example` to `.env` and fill in Circle, Supabase, and Arc testnet values.
3. Get testnet USDC from the [Circle faucet](https://faucet.circle.com) (select Arc Testnet).
4. `npm run dev:web` — dashboard at `localhost:3000`.
5. `npm run dev:agent` — starts the decision loop.
