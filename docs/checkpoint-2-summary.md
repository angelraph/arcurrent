Arcurrent is an autonomous treasury agent on Arc: it reads a company's payment obligations, decides when it's safe to pay from real signals (treasury balance, due dates, a reserve floor), and settles in USDC with no human approving each transaction. Entering both the DeFi and Agentic Economy tracks.

Core spine is real end-to-end, no mocked data anywhere in the path: a Next.js dashboard backed by Postgres (Supabase), a decision engine that reads a real deployed `ObligationEscrow` contract's on-chain USDC balance, and settlement executed as a Circle contract-execution transaction through Developer-Controlled Wallets — so every payment is independently verifiable on Arc Testnet Explorer, not just a database row.

Since Checkpoint 1, the two biggest additions:

- **Cross-chain liquidity top-up.** When settling an obligation would drop the treasury below its reserve floor, the agent now bridges the exact shortfall in from a second Circle-custodied wallet on Base Sepolia via Bridge Kit's CCTP (approve → burn → attestation → mint, both legs signed through `@circle-fin/adapter-circle-wallets` — no private key held for either wallet), deposits it into the escrow, and settles on the next pass. Verified against live testnet infrastructure, not a test double: real burn/mint transactions, real escrow deposit, real settlement.
- **A working production deployment.** `arcurrent-web` had been silently broken since it was first set up — the only deployment on record had failed at `npm install` and nothing had redeployed since. Root-caused and fixed (a monorepo Root Directory misconfiguration plus a missing build dependency), reconnected GitHub for auto-deploy on push, and confirmed a clean deploy from a fresh clone. Also added a real, working x402 nanopayment flow (the agent pays a rate oracle a sub-cent fee for live FX rates before recording a `convert_currency` decision) and a plain-language landing page separate from the live dashboard.

Live dashboard: https://arcurrent-web.vercel.app/dashboard
Repo: https://github.com/angelraph/arcurrent

Known gap, tracked rather than faked: StableFX access is gated (RFQ-based, no self-serve signup as of this writing), so non-USDC obligations are correctly flagged for conversion but not yet settled automatically.
