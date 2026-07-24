# Arcurrent — 3-minute pitch script

Timing is a guide, not a script to read robotically. Say it like you mean it — you built something real, so talk about it like it's real.

## 0:00–0:20 — Hook (talking head or title card)

"Every autonomous agent that's supposed to move money hits the same wall: it needs to hold funds it can prove it controls, and it needs to leave a record precise enough that a wrong payment is provable, not just trusted. A normal payments API can't do either of those without a human in the loop. Arc can, because gas is USDC and settlement is sub-second. This is Arcurrent — an agent that pays your company's bills on Arc, with nobody clicking approve."

## 0:20–0:50 — The problem, concretely

"Say your company owes a vendor five thousand dollars in USDC, due next week. Normally someone checks the balance, checks the due date, and clicks send. Arcurrent does that check itself, on a schedule, against a real treasury balance — read live off a deployed smart contract, not a spreadsheet. If paying now would drop the balance below a reserve floor you set, it doesn't guess — it goes and gets more money first."

## 0:50–1:50 — Live demo (screen recording of the dashboard)

Show, in order:
1. The dashboard at `/dashboard` — real escrow balance, real treasury wallet balance.
2. Add an obligation sized to breach the reserve floor (or show one already in the table).
3. Point at the decision log entry showing `request_liquidity` — read the reasoning out loud.
4. Click through to the actual transaction hashes — Base Sepolia burn tx, Arc Testnet mint tx — to prove it's real CCTP, not a mock.
5. Show the next decision log entry: `pay_now`, settled, with its own transaction hash on Arc Testnet Explorer.

Narration while showing this:

"Here's an obligation that would've breached the reserve floor. The agent flagged it, bridged four dollars of USDC in from a second wallet on Base Sepolia over Circle's Cross-Chain Transfer Protocol — that's a real burn on Base, a real mint on Arc, both signed through Circle's own wallet infrastructure, no private key anywhere in this codebase — deposited it into the escrow contract, and on the very next pass, paid the obligation. Every one of these is a transaction hash you can click and verify yourself, right now, on Arc Testnet Explorer."

## 1:50–2:20 — Why this needs Arc specifically

"This only works because Arc's gas token is USDC — the same money moving through the system, not a second token the agent has to keep topped up separately — and because settlement finishes in under a second, so checking a balance every few minutes doesn't cost more than the payments it's protecting. That's not a nice-to-have for an autonomous agent. It's the whole reason this is possible at all."

## 2:20–2:45 — What's real vs. what's next

"Everything you just saw is real: Circle's Developer-Controlled Wallets, a deployed escrow contract, a real CCTP bridge, and x402 nanopayments — the agent pays a rate oracle a sub-cent fee before it acts on a foreign-currency bill. The one thing that's not wired up yet is StableFX itself, for actually converting non-USDC obligations — that's gated behind Circle's RFQ access, not something we could self-serve our way into. Everything else in this pipeline is production-shaped, not a demo."

## 2:45–3:00 — Close

"Arcurrent is live right now at arcurrent-web.vercel.app, code's public on GitHub, and it's running the same evaluation loop on a schedule with nobody watching. We're applying for both the DeFi and Agentic Economy tracks, because it genuinely is both: programmable treasury infrastructure, and a real autonomous agent making its own calls. Thanks for watching."

---

## Recording notes

- Record the demo section (0:50–1:50) as a real screen capture against the live dashboard, not staged. If a `request_liquidity` decision isn't currently sitting in the log, either wait for the reserve floor to be tight again or add an obligation sized to trigger it, same as the earlier test run.
- Keep transaction hash links visible on screen long enough to actually read — a judge pausing the video should be able to click through later.
- If total runtime creeps past 3:00, cut from the "why Arc" section first — the demo is the part that actually proves the pitch, don't shorten that.
