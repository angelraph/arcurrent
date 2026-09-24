# Stack verification notes (2026-07-14)

Everything below was independently confirmed, not taken on a single source's word,
before being written into config. Re-verify anything here before mainnet migration or
if a build breaks against a listed version.

## Arc Testnet

- Chain ID: `5042002`, confirmed via docs.arc.io/arc/references/connect-to-arc AND
  chainlist.org/chain/5042002.
- RPC: `https://rpc.testnet.arc.network` (also Blockdaemon/dRPC/QuickNode mirrors listed
  in the same doc).
- Explorer: `https://testnet.arcscan.app`
- Faucet: `https://faucet.circle.com` (confirmed "Arc Testnet" is a selectable network;
  also linked directly from the app's own `/faucet` page).
- USDC ERC-20 interface address: `0x3600000000000000000000000000000000000000`,
  confirmed via docs.arc.io. This is a precompile-style address, not a typo/placeholder.
  6 decimals on this interface.
- Native/gas-level USDC view uses **18 decimals**; do not sum the two views. Always
  read balances/transfers through the ERC-20 interface above.
- CCTP domain ID for Arc: `26` (per circlefin/skills `use-arc` doc). TokenMessenger/
  MessageTransmitter raw addresses were not pulled; use Bridge Kit, which resolves
  routing internally, rather than hardcoding these.
- Fully EVM-compatible: Hardhat/viem/ethers work unmodified. No KYC/allowlist for
  testnet.

## Arc Mainnet (verified 2026-09-22, live since ~2026-09-16)

- Chain ID: `5042`, confirmed via docs.arc.io/arc/references/connect-to-arc.
- RPC: `https://rpc.mainnet.arc.io` (Blockdaemon/dRPC/QuickNode mirrors follow the same
  `<provider>.mainnet.arc.io` naming pattern as testnet).
- Explorer: `https://explorer.arc.io`
- No faucet, obviously -- mainnet USDC is real money. Fund a wallet yourself.
- USDC ERC-20 interface address: same fixed precompile as testnet,
  `0x3600000000000000000000000000000000000000`, confirmed via docs.arc.io. Same
  18-decimal-native / 6-decimal-ERC20-view split as testnet; don't mix them.
- **Not resolved, don't guess:** CCTP domain ID for mainnet, and Circle's `usdcTokenId`
  for mainnet USDC (resolve the latter from a live `getWalletTokenBalance` call against
  a real mainnet wallet, the same way the testnet one was resolved -- see the TODOs in
  `packages/shared/src/chain.ts`).
- Circle's `blockchain` identifier for mainnet wallet creation is **`"ARC"`** (testnet is
  `"ARC-TESTNET"`) -- resolved directly from
  `@circle-fin/developer-controlled-wallets`' own installed type definitions (its
  `Blockchain`/`TokenBlockchain` enums), not a guess or docs page.
- **Real gotcha, worth knowing:** a Sandbox/Test Circle API key (`TEST_API_KEY:...`)
  cannot touch any mainnet blockchain at all -- `createWallets({ blockchains: ["ARC"] })`
  fails with error `156006` ("TEST_API key cannot be used with blockchain mainnets").
  Needs a **Live** API key from console.circle.com's Live environment, not just a
  different value for the same Sandbox key.
- **Real gotcha, worth knowing:** the entity secret is registered per environment, not
  once per account. Reusing the Sandbox-registered entity secret against a Live API key
  fails with error `156016` ("The entity secret has not been set yet. Please provide
  encrypted ciphertext in the console."), even though it's a valid-looking secret. Fix:
  `tsx scripts/setup-entity-secret.ts generate` for a **new** Live-scoped secret, then
  `register` it -- this writes a `recovery_file_*.dat` to the repo root (gitignored by
  `recovery_file_*.dat` in `.gitignore`); back it up outside the repo too, it's what lets
  Circle recover this entity's wallets if the secret is ever lost.
- A third-party report (github.com/circlefin/arc-node issue #454, unofficial, not
  independently reproduced here) claims the public mainnet RPC load-balances across
  backends with inconsistent chain heads (occasional `-32014` errors) and caps
  `eth_getLogs` at ~10,000 blocks. Treat RPC retries as normal, not fatal, the same as
  the fallback transport already does for testnet's rate limiting.
- **Reproduced independently (2026-09-23):** viem's `waitForTransactionReceipt` (block-
  filter based polling) repeatedly timed out against a tx that a plain
  `getTransactionReceipt` call found immediately when queried directly -- consistent
  with the inconsistent-chain-heads report above (whichever backend serves the
  block-filter poll isn't always the one that already has the tx). Scripts that need to
  wait for confirmation against mainnet should poll `getTransactionReceipt` directly in
  a retry loop (see `waitForReceipt()` in `scripts/mandate-split-demo.ts`) instead of
  relying on `waitForTransactionReceipt`.

## Verifying contract source on Arc's explorer (2026-09-24)

`explorer.arc.io` is Blockscout behind a Cloudflare bot check: `curl`, Node `fetch` and
`hardhat verify` all get the challenge page instead of the API, so scripted verification
does not work. It does work from a normal browser session against the explorer's own API:
`POST /api/v2/smart-contracts/<addr>/verification/via/standard-input` (multipart:
`compiler_version` as `v0.8.28+commit.7893614a`, `contract_name`, `license_type`,
`autodetect_constructor_args=false`, `constructor_args` as the 32-byte-padded USDC
precompile address, and `files[0]` = the Standard JSON input).

Use the `input` object saved in
`packages/contracts/ignition/deployments/chain-5042/build-info/*.json`, not a fresh
compile of the current source: it is the exact compiler input that produced the deployed
bytecode, so it verifies as a full match (the SPDX header was changed from UNLICENSED to
MIT after deployment, which alters the metadata hash of a fresh compile). Verified for
`MandateEscrow` at `0xca901f58fb82FE5FF459264a419b8cF8c75b3371`; `is_fully_verified: true`.

## Security self-review: MandateEscrow.sol (2026-09-23)

No professional audit -- out of scope/budget for a microgrant-stage submission -- but
worth being explicit about what was actually checked rather than leaving it unstated:

- **Static analysis**: `slither packages/contracts/contracts/MandateEscrow.sol
  --solc-remaps "@openzeppelin=node_modules/@openzeppelin"` (slither 0.11.6, solc
  0.8.37) reports zero reentrancy, access-control, unchecked-call, or arithmetic
  findings. The only hits are a `timestamp`-comparison note on the day-granularity
  deadline checks (expected and low-risk at that granularity) and boilerplate about
  OpenZeppelin's own library pragma ranges/inline assembly inside `SafeERC20` --
  neither is about this contract's logic.
- **Manual review of the trust model**: `release()` is funder-gated and pays out
  whatever `destinations`/`amounts` the funder supplies, which must sum exactly to the
  mandate's locked amount (`require(total == mandate.amount)`) -- so a funder can route
  funds anywhere but can never move more or less than what's actually escrowed.
  `refund()` only fires past `deadline` and only from `Funded` (never after proof was
  submitted), so a fulfiller who already proved can't be refunded out from under them.
  There is deliberately no arbitration: a funder can still grief a fulfiller by
  withholding release after proof, and that's stated as a known, accepted limitation in
  the contract's own top-level comment, not something quietly hidden.
- **Not covered**: formal verification, fuzzing beyond the unit tests already in
  `MandateEscrow.t.sol`, and a second independent reviewer. Treat this as "self-reviewed
  and unit-tested," not "audited."

## Security self-review: AgentVault.sol (2026-09-24)

Not professionally audited. This is what was actually done, and what was not.

- **What it guarantees.** The operator (the agent's signing wallet) can call exactly
  one function, `pay(to, amount, ref)`, and only within: a per-payment cap, a daily
  cap, an optional payee allowlist, and while unpaused. It cannot withdraw, change a
  rule, or pay the vault, the escrow or the token address (each would strand the
  funds). The owner alone changes rules and can always withdraw, even while paused. A
  guardian can pause but never resume. Ownership moves in two steps and cannot be
  renounced (renouncing would leave the funds with no one able to withdraw them).
- **Daily cap as a token bucket.** A fixed daily window lets a full cap be spent at
  23:59 and again at 00:01. The bucket refills continuously at `dailyCap / 1 day` up to
  `dailyCap`, so spending over any interval is bounded by the cap plus what refilled.
  Refill rounds down, which is the conservative direction. Changing the limits settles
  refill under the old cap first and then clamps; raising a cap refills gradually.
- **Tests.** 32 Solidity tests against the real `MandateEscrow` and a mock USDC: every
  role and rule, rejection paths, two-step ownership, operator rotation, atomicity of
  create-and-release, and no stranded funds. Three fuzz suites (256 runs each): total
  spend never exceeds the starting cap plus refill over random sequences of payments
  and time jumps, no payment exceeds the per-payment cap, and vault plus payee balances
  always sum to what was funded.
- **Mutation check.** The contract was deliberately broken four ways (daily check
  removed, allowlist check removed, refill without the cap clamp, withdraw open to
  anyone) and each was caught by the suite (two failing tests per mutant), then
  restored byte for byte.
- **Static analysis.** `slither` (0.11.6) reports no reentrancy, access-control,
  unchecked-call or arithmetic findings. The only notes are two intended choices:
  `setOperator` / `setGuardian` accept the zero address (that is the "disable" switch,
  covered by tests) and the timestamp comparisons in the bucket maths (second
  granularity, so miner manipulation is irrelevant).
- **Real-chain rehearsal.** `scripts/vault-rehearsal.ts` deployed `MandateEscrow` and
  `AgentVault` to Arc testnet with throwaway keys and ran 29 checks through the SDK
  against the live contracts (every rule refused by the SDK and, where checked, by the
  contract itself; a stranger and the operator failing to change rules; the guardian
  failing to resume; owner withdraw while paused; operator rotation; two-step
  ownership). `scripts/vault-mcp-e2e.ts` did the same through a real MCP server
  subprocess in vault mode.
- **What compromise costs.** Agent credentials leaking (Circle API key and entity
  secret, or the Vercel env) lets an attacker spend as the operator, bounded by the
  caps and allowlist; they cannot withdraw, and the owner can pause or rotate the
  operator. The owner wallet leaking loses the vault. A contract bug loses at most the
  vault balance, which is why it should stay small.
- **Not covered, stated plainly.** No professional audit, no formal verification, no
  second independent reviewer, and no invariant-suite beyond the fuzz tests above.
  The vault cannot judge whether a payment is deserved: a compromised operator can
  still spend up to the caps on allowed payees. USDC is issued by Circle, which can
  freeze an address; a frozen vault could not move funds (an issuer-level risk shared
  by every USDC holder, noted rather than mitigated). Mainnet behaviour of the USDC
  precompile with `forceApprove` was only observed on testnet before deployment.

## Circle SDKs (all confirmed live on the npm registry, not just in docs)

| Package | Version at scaffold time |
|---|---|
| `@circle-fin/developer-controlled-wallets` | 10.8.0 |
| `@circle-fin/app-kit` | 1.9.0 |
| `@circle-fin/x402-batching` | 3.2.0 |
| `@circle-fin/bridge-kit` | 1.12.0 (superseded in our stack by `app-kit`, which wraps it, see below) |
| `@circle-fin/smart-contract-platform` | 10.8.0 |

`@circle-fin/app-kit` is what Circle's own `arc-fintech` sample uses for bridging
(`kit.bridge()` / `kit.estimateBridge()`), so we follow that rather than calling
`bridge-kit` directly.

## Reference apps (real repos, confirmed via `gh repo view`, not hallucinated)

- `circlefin/arc-fintech`, multi-chain treasury dashboard: Next.js + Supabase +
  Developer Controlled Wallets + Gateway + App Kit. **Closest existing shape to
  Arcurrent**, worth reading closely before building the dashboard/webhook layer.
- `circlefin/arc-nanopayments`, LangChain buyer agent + x402-protected Next.js seller.
  Reference for the Nanopayments oracle-fee flow.
- `circlefin/arc-escrow`, AI-validated deliverable release using Developer Controlled
  Wallets + a deployed EIP-712 escrow contract + OpenAI validation. Reference for the
  "agent decision -> onchain release" pattern our obligation settlement follows.

## StableFX: gated, not self-serve

RFQ model (request quote -> competing LPs -> PvP settlement via smart-contract escrow
on Arc). API access requires contacting a Circle rep directly; no public signup found
as of 2026-07-14. **Action item: request access now**, since this is the longest
lead-time dependency in the whole build. Until granted, `decide.ts` flags any
non-USDC obligation with a `convert_currency` action and an explanatory reasoning
string, that's the entire gap-handling today. There's no adapter interface or stub
file in `packages/shared` yet, just that one decision branch, so StableFX can be
wired in against it without restructuring the decision engine once access lands.

## Paymaster: out of scope

Circle Paymaster (ERC-4337 USDC gas sponsorship) is offered on Arbitrum/Base/Avalanche/
Ethereum/OP/Polygon/Unichain, chains where the native gas token isn't USDC. Arc's gas
token already is USDC, so Paymaster doesn't apply here and isn't offered for Arc.
Dropped from scope entirely.

## Hardhat 3, not Foundry

Foundry's Windows install path (`foundryup`) is native-binary/shell-script based and
was more setup friction than justified for a solo 4-week build with no WSL in this
environment. Hardhat 3 is pure Node, scaffolded via
`npx hardhat --init --template node-test-runner-viem`, and is a materially different
config format from Hardhat 2 (ESM-first, `configVariable()` instead of raw
`process.env`, `edr-simulated` network types, Ignition instead of deploy scripts); if
you've used Hardhat 2 before, read `packages/contracts/AGENTS.md` before editing
`hardhat.config.ts`, the config shape does not match older training data or tutorials.
