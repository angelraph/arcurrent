# @arcurrent/mandate-mcp

An [MCP](https://modelcontextprotocol.io) server that lets any AI agent use **MandateEscrow** on Arc mainnet: inspect mandates and on-chain reputation, and, only if you opt in, create, prove, release and refund them with real USDC.

MandateEscrow is an open escrow contract ([`0xca90…3371`](https://explorer.arc.io/address/0xca901f58fb82FE5FF459264a419b8cF8c75b3371?tab=contract), source verified): a funder locks USDC for a fulfiller, the fulfiller posts a hash of their proof, the funder releases (atomically, optionally split across addresses), and every outcome updates a reputation ledger per address. This server is the same contract exposed as tools, built on [`@arcurrent/mandate-sdk`](../mandate-sdk).

> Status: lives in this monorepo and is not published to npm yet. Build it with `npm install && npm run build -w @arcurrent/mandate-mcp` and point your client at `packages/mandate-mcp/dist/index.js`.

## Tools

Always available (read-only):

| Tool | What it does |
|---|---|
| `get_config` | Network, contract, whether writes are on, the wallet and its USDC balance, and spend limits. |
| `get_mandate` | One mandate: status, amount, funder, fulfiller, deadline, proof hash. With a wallet configured it also says what that wallet can do next. |
| `list_mandates` | Newest first, with `limit` and `offset`. |
| `get_reputation` | An address's completed and refunded counts and total USDC settled. |
| `verify_proof` | Does this evidence text match the proof hash committed on-chain? |

Only registered when writes are enabled (they move real funds):

| Tool | What it does |
|---|---|
| `create_mandate` | Lock USDC for a fulfiller (or leave it open), with an optional refund deadline. |
| `submit_proof` | Post a hash of your evidence as the fulfiller. |
| `release_mandate` | Pay out, funder only. Optional atomic split. |
| `refund_mandate` | Reclaim an unproven mandate after its deadline. |

## Configure it

Read-only needs no configuration at all. Claude Code:

```bash
claude mcp add mandate-escrow -- node /absolute/path/to/arcurrent/packages/mandate-mcp/dist/index.js
```

Claude Desktop or any client that takes a JSON config:

```json
{
  "mcpServers": {
    "mandate-escrow": {
      "command": "node",
      "args": ["/absolute/path/to/arcurrent/packages/mandate-mcp/dist/index.js"]
    }
  }
}
```

To let the agent move funds, add a wallet and turn writes on explicitly:

```json
{
  "mcpServers": {
    "mandate-escrow": {
      "command": "node",
      "args": ["/absolute/path/to/arcurrent/packages/mandate-mcp/dist/index.js"],
      "env": {
        "MANDATE_PRIVATE_KEY": "0x...",
        "MANDATE_ENABLE_WRITES": "true",
        "MANDATE_MAX_USDC": "5",
        "MANDATE_SESSION_BUDGET_USDC": "20"
      }
    }
  }
}
```

| Variable | Default | Meaning |
|---|---|---|
| `MANDATE_ENABLE_WRITES` | off | Must be exactly `true` to register the fund-moving tools. |
| `MANDATE_PRIVATE_KEY` | none | Signing wallet. Ignored unless writes are enabled. |
| `MANDATE_MAX_USDC` | `5` | Ceiling for a single `create_mandate`. |
| `MANDATE_SESSION_BUDGET_USDC` | `20` | Total this server process may lock; resets on restart. |
| `MANDATE_RPC_URL` | Arc's public RPC | Point at your own endpoint if you have one. |
| `MANDATE_ESCROW_ADDRESS` | the deployed contract | Override only for a fork or redeploy. |

## Vault mode: let an agent pay, inside limits you set on-chain

Set `MANDATE_VAULT_ADDRESS` to an [AgentVault](../contracts/contracts/AgentVault.sol) and the
server changes shape. `MANDATE_PRIVATE_KEY` becomes the vault's **operator** wallet, which
holds only gas. The unrestricted create, release and refund tools are **not registered at
all**; the only way to move funds is `vault_pay`, and the vault refuses anything outside the
owner's rules no matter what the agent says.

| Tool | What it does |
|---|---|
| `get_vault` | The vault's balance, per-payment and daily caps, allowance available right now, allowlist and pause state, and roles. |
| `check_vault_payment` | Would this payment be allowed right now, and if not, why. No gas, nothing sent. |
| `vault_pay` | Pay from the vault as one atomic mandate. Needs `MANDATE_ENABLE_WRITES=true`. |

```json
{
  "mcpServers": {
    "mandate-escrow": {
      "command": "node",
      "args": ["/absolute/path/to/arcurrent/packages/mandate-mcp/dist/index.js"],
      "env": {
        "MANDATE_VAULT_ADDRESS": "0xYourVault",
        "MANDATE_PRIVATE_KEY": "0xOperatorKeyHoldingOnlyGas",
        "MANDATE_ENABLE_WRITES": "true"
      }
    }
  }
}
```

If that key leaks, an attacker can spend inside the vault's caps and allowlist and nothing
more, and the owner can pause it or rotate the operator from the dashboard. Compare that
with plain mode, where the key controls the whole wallet. Add `MANDATE_NETWORK=testnet` with
`MANDATE_ESCROW_ADDRESS` to run against Arc testnet.

## Safety model

- **Read-only by default.** With no key, or a key but no `MANDATE_ENABLE_WRITES=true`, the fund-moving tools are not even listed, so the agent cannot try them.
- **Use a dedicated wallet with a small balance.** The key sits in your client's config in plain text. Never point this at a wallet you cannot afford to lose; the caps below limit a mistake, they do not make a large balance safe.
- **Two spend rails.** `MANDATE_MAX_USDC` caps each mandate and `MANDATE_SESSION_BUDGET_USDC` caps the total, so an agent stuck in a loop cannot drain the wallet one small mandate at a time. A failed create does not count against the budget.
- **Tools are marked destructive.** `create_mandate`, `release_mandate` and `refund_mandate` carry the MCP destructive hint, so clients that ask for confirmation will, and the server's own instructions tell the agent to confirm amounts and destinations with you first.
- **Nothing to inject.** Every value the tools return comes from the contract (addresses, amounts, status, a hash). There is no free-text field a third party could plant instructions in; the only text that is hashed is what the agent itself supplies.
- **Bad input never reaches the chain.** Addresses, amounts and ids are validated against strict schemas, every write is simulated first, and failures come back as structured errors such as `AMOUNT_OVER_CAP`, `NOT_AUTHORIZED` or `WRONG_STATUS`.
- **The key is never logged.** Startup notices go to stderr and name only the wallet address.

## Trust model of the contract itself

The funder's release is the only condition: no oracle judges the work, and a funder can withhold release after a fulfiller has posted proof with no recourse. The contract is self-reviewed (static analysis plus unit tests), not professionally audited. Keep amounts proportionate.

## Verifying your setup

`scripts/mandate-mcp-e2e.ts` in the repo spawns this server exactly as a client would and exercises it against mainnet. `npx tsx scripts/mandate-mcp-e2e.ts` runs the free read-only checks; add `--write` for a real create, prove, release cycle of 0.000001 USDC from `ARC_MAINNET_DEPLOYER_PRIVATE_KEY`.
