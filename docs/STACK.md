# Stack verification notes (2026-07-14)

Everything below was independently confirmed — not taken on a single source's word —
before being written into config. Re-verify anything here before mainnet migration or
if a build breaks against a listed version.

## Arc Testnet

- Chain ID: `5042002` — confirmed via docs.arc.io/arc/references/connect-to-arc AND
  chainlist.org/chain/5042002.
- RPC: `https://rpc.testnet.arc.network` (also Blockdaemon/dRPC/QuickNode mirrors listed
  in the same doc).
- Explorer: `https://testnet.arcscan.app`
- Faucet: `https://faucet.circle.com` — confirmed "Arc Testnet" is a selectable network.
- USDC ERC-20 interface address: `0x3600000000000000000000000000000000000000` —
  confirmed via docs.arc.io. This is a precompile-style address, not a typo/placeholder.
  6 decimals on this interface.
- Native/gas-level USDC view uses **18 decimals** — do not sum the two views. Always
  read balances/transfers through the ERC-20 interface above.
- CCTP domain ID for Arc: `26` (per circlefin/skills `use-arc` doc). TokenMessenger/
  MessageTransmitter raw addresses were not pulled — use Bridge Kit, which resolves
  routing internally, rather than hardcoding these.
- Fully EVM-compatible — Hardhat/viem/ethers work unmodified. No KYC/allowlist for
  testnet.
- No mainnet yet as of 2026-07-14.

## Circle SDKs (all confirmed live on the npm registry, not just in docs)

| Package | Version at scaffold time |
|---|---|
| `@circle-fin/developer-controlled-wallets` | 10.8.0 |
| `@circle-fin/app-kit` | 1.9.0 |
| `@circle-fin/x402-batching` | 3.2.0 |
| `@circle-fin/bridge-kit` | 1.12.0 (superseded in our stack by `app-kit`, which wraps it — see below) |
| `@circle-fin/smart-contract-platform` | 10.8.0 |

`@circle-fin/app-kit` is what Circle's own `arc-fintech` sample uses for bridging
(`kit.bridge()` / `kit.estimateBridge()`), so we follow that rather than calling
`bridge-kit` directly.

## Reference apps (real repos, confirmed via `gh repo view`, not hallucinated)

- `circlefin/arc-fintech` — multi-chain treasury dashboard: Next.js + Supabase +
  Developer Controlled Wallets + Gateway + App Kit. **Closest existing shape to
  Arcurrent** — worth reading closely before building the dashboard/webhook layer.
- `circlefin/arc-nanopayments` — LangChain buyer agent + x402-protected Next.js seller.
  Reference for the Nanopayments oracle-fee flow.
- `circlefin/arc-escrow` — AI-validated deliverable release using Developer Controlled
  Wallets + a deployed EIP-712 escrow contract + OpenAI validation. Reference for the
  "agent decision -> onchain release" pattern our obligation settlement will follow.

## StableFX — gated, not self-serve

RFQ model (request quote -> competing LPs -> PvP settlement via smart-contract escrow
on Arc). API access requires contacting a Circle rep directly — no public signup found
as of 2026-07-14. **Action item: request access now**, since this is the longest
lead-time dependency in the whole build. Until granted, the FX conversion step sits
behind a plain adapter interface in `packages/shared` with no implementation — not a
fake/mocked one — so it can be wired in the moment access lands without touching
calling code.

## Paymaster — out of scope

Circle Paymaster (ERC-4337 USDC gas sponsorship) is offered on Arbitrum/Base/Avalanche/
Ethereum/OP/Polygon/Unichain — chains where the native gas token isn't USDC. Arc's gas
token already is USDC, so Paymaster doesn't apply here and isn't offered for Arc.
Dropped from scope entirely.

## Hardhat 3, not Foundry

Foundry's Windows install path (`foundryup`) is native-binary/shell-script based and
was more setup friction than justified for a solo 4-week build with no WSL in this
environment. Hardhat 3 is pure Node, scaffolded via
`npx hardhat --init --template node-test-runner-viem`, and is a materially different
config format from Hardhat 2 (ESM-first, `configVariable()` instead of raw
`process.env`, `edr-simulated` network types, Ignition instead of deploy scripts) — if
you've used Hardhat 2 before, read `packages/contracts/AGENTS.md` before editing
`hardhat.config.ts`, the config shape does not match older training data or tutorials.
