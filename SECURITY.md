# Security policy

Arcurrent moves real USDC on Arc mainnet, so security reports are welcome.

## Reporting a vulnerability

Please report privately, not in a public issue:

- Use GitHub's **private vulnerability reporting**:
  <https://github.com/angelraph/arcurrent/security/advisories/new>
- If that is unavailable to you, open a public issue that says only that you have a
  security report and how you would like to be reached, with no technical details.

Include what you found, how to reproduce it, and which contract or route it affects.

## Scope

In scope:

- `MandateEscrow` and `AgentVault` on Arc mainnet, and their source in
  `packages/contracts/contracts/`.
- The web app routes that touch funds or secrets: the owner-passcode form, the cron
  evaluation route, and the Circle webhook.
- `@arcurrent/mandate-sdk` and `@arcurrent/mandate-mcp`.

Out of scope: social engineering, denial of service against third-party providers
(Circle, Supabase, Vercel, Arc RPCs), and issues that require a compromised owner
wallet, which can by design do anything the vault permits.

## What to know first

- The contracts are **self-reviewed, not professionally audited**. The review, test and
  mutation results are in [docs/STACK.md](docs/STACK.md).
- The vault holds a deliberately small balance, and its limits are public on the
  [dashboard](https://arcurrent.site/dashboard).
- The agent's signing wallet holds only gas. No private key lives in this repository.

There is no paid bounty program. Credit in the changelog is offered to anyone who
wants it.
