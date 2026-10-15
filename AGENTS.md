# Agent instructions

- Arcurrent is an open escrow primitive (`MandateEscrow`), a bounded-spending treasury vault
  (`AgentVault`) and an autonomous agent that pays through it, live on Arc mainnet (chain 5042).
- Never send a transaction, and never read or print `.env`, `.env.local` or any key. Mainnet
  actions are signed only by the vault owner's own wallet. This project never holds the owner key.
- Do not change the contracts or the live agent loop without being asked. Both move real USDC.
- Facts live in [README.md](README.md), [docs/AUDIT.md](docs/AUDIT.md),
  [docs/LAUNCH.md](docs/LAUNCH.md) and [docs/STACK.md](docs/STACK.md). Check them before
  stating a number, and update them when a number changes.
- Checks: `npm test` (every workspace), `npx tsc --noEmit -p apps/web`, `npm run lint -w web`.
- Use `https://arcurrent.site` in public copy, not the vercel.app URL.
- Copy style: no em dashes, and no " -- " as a dash.
- Pitch scripts and personal talking points stay out of the repository.
- `apps/web` runs a newer Next.js than most training data covers: read
  `apps/web/node_modules/next/dist/docs/` before changing its APIs.
