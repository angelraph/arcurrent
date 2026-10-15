# Mainnet launch record

What was deployed to Arc mainnet (chain 5042), when, and how to check each fact
yourself. Everything below can be read straight from the chain; nothing here depends
on trusting this repository.

## Contracts

| Contract | Address | Deployment transaction | Block | Source |
|---|---|---|---|---|
| MandateEscrow | [`0xca901f58fb82FE5FF459264a419b8cF8c75b3371`](https://explorer.arc.io/address/0xca901f58fb82FE5FF459264a419b8cF8c75b3371?tab=contract) | [`0x826de7ae…2c2f7`](https://explorer.arc.io/tx/0x826de7ae76f5b801fd31c0c43da38467101aa45a23e748ab12dbd44957a2c2f7) | 22,222,031 | verified on the explorer |
| AgentVault | [`0x8B4e7F295Ed70DA321831bA34cd0C84443C427B5`](https://explorer.arc.io/address/0x8B4e7F295Ed70DA321831bA34cd0C84443C427B5?tab=contract) | [`0x6afc9d50…c8ab`](https://explorer.arc.io/tx/0x6afc9d507957bd3ae5c771b110ce2d771a62cc7f9e8aa6443a913c2cf534c8ab) | 22,589,501 | verified on the explorer |

Both come from the Hardhat Ignition journal committed at
`packages/contracts/ignition/deployments/chain-5042/`, which records the transaction
hashes, blocks and addresses above.

## Roles on the vault

| Role | Address | Can |
|---|---|---|
| Owner | `0xF3DBB59eC67372095211b20D830340c1C4EEBbb3` | change limits, approve payees, fund, withdraw, pause and resume |
| Operator (the agent's Circle wallet) | `0xF52E1b4F64C8E78A495639027a2A291a6ACbD96e` | call `pay()` inside the limits; holds gas only |
| Guardian | `0x2cf2901e8866E6996710c7463983744d1822928D` | pause only; cannot spend, resume or withdraw |

Limits at launch: $1.00 per payment, $5.00 per day (refilling continuously), payee
allowlist on.

## First payment through the vault

On 2026-09-28 the vault was funded with $1.00 and one payee was approved. The agent
then paid a $0.05 obligation on its own, as one `AgentVault.pay()` call that created and
released MandateEscrow mandate #6 atomically. The vault contract is the funder of
record on that mandate.

| | |
|---|---|
| Transaction | [`0x4a46a2d1…ba75`](https://explorer.arc.io/tx/0x4a46a2d1d75d7a80479957af389f9c2ca3196fc34bcd632f44c8b85f0d10ba75) |
| Mandate | #6, funder = the vault, released |
| Vault balance after | $0.95 |

## Check it yourself

No wallet needed:

```bash
RPC=https://rpc.mainnet.arc.io
cast call 0x8B4e7F295Ed70DA321831bA34cd0C84443C427B5 "availableNow()(uint256)" --rpc-url $RPC   # allowance right now
cast call 0xca901f58fb82FE5FF459264a419b8cF8c75b3371 "nextMandateId()(uint256)" --rpc-url $RPC   # mandates ever created
cast call 0x8B4e7F295Ed70DA321831bA34cd0C84443C427B5 "isAllowedPayee(address)(bool)" 0xFde19f3BCd5482544ce672391d839a56dA96BFEE --rpc-url $RPC
```

## Timeline

| Date | Milestone |
|---|---|
| 2026-07-14 | Arc testnet network and package facts verified against the docs (see [STACK.md](STACK.md)) |
| 2026-09-22 | MandateEscrow deployed to mainnet; first real settlements through it |
| 2026-09-23 | Atomic split release proven on mainnet |
| 2026-09-24 | AgentVault added, deployed to mainnet, and the agent's payments routed through it |
| 2026-09-28 | Vault funded; first vault-funded payment (mandate #6) |
| 2026-09-29 | SDK and MCP server published to npm; guardian set |
| 2026-10-02 | Submitted to Arc Microgrants |

## What has not happened yet

- **No outside wallet has used MandateEscrow yet.** It is open to anyone, and the
  first independent caller is the next proof this project needs.
- **No independent security review.** The contracts are self-reviewed and tested; see
  [STACK.md](STACK.md). Keep balances small.
- The cross-chain top-up and non-USDC settlement remain disabled or gated, as listed
  in the README's known gaps.
