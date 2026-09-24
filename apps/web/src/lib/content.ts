/**
 * Copy for the landing page's roadmap and FAQ. Lives in one typed file so the
 * page, the FAQ structured data and the tests all read the same words, and so
 * nothing on the roadmap can claim more than what is actually built.
 */

export type RoadmapStatus = "shipped" | "next" | "later";

export interface RoadmapColumn {
  status: RoadmapStatus;
  label: string;
  title: string;
  items: string[];
}

export const ROADMAP: RoadmapColumn[] = [
  {
    status: "shipped",
    label: "Shipped",
    title: "Live on Arc mainnet today",
    items: [
      "MandateEscrow: an open, permissionless escrow with atomic split releases, refunds and an on-chain reputation ledger. Source verified on the explorer.",
      "AgentVault: the treasury behind the agent, with a per-payment cap, a daily cap that refills continuously, a payee allowlist and a pause switch. The agent can never withdraw.",
      "The autonomous agent: decides from the vault's real balance, due dates and a reserve floor, then pays with one atomic transaction, confirmed by a signed webhook.",
      "Self-serve pages: connect a wallet to fund your own mandate, share payment-request links, verify proofs in the browser, and read any mandate or address straight from the chain.",
      "A typed SDK and an MCP server that let any project or AI agent use MandateEscrow, or pay through a vault, with spend caps and simulate-first errors.",
      "Tested the hard way: fuzz tests on the cap maths, mutation checks where the contracts were deliberately broken, and rehearsals against live chains.",
    ],
  },
  {
    status: "next",
    label: "Building next",
    title: "Make it easy to trust and easy to adopt",
    items: [
      "Publish the SDK and the MCP server to npm so a project can install them in one command.",
      "An independent security review of MandateEscrow and AgentVault before either holds more than a small balance.",
      "Alerts: tell a funder when a proof arrives, and tell the vault owner when a rule is holding the agent back.",
      "Transaction history on every mandate page, from an indexer instead of one contract read at a time.",
      "Guidance and tooling for running the vault owner as a multisig.",
    ],
  },
  {
    status: "later",
    label: "Later",
    title: "From a working build to real usage",
    items: [
      "A second, unrelated project or agent funding or fulfilling a mandate: the real proof that the primitive is open.",
      "Auto-settling non-USDC bills through StableFX, once access is granted.",
      "The cross-chain liquidity top-up (CCTP) re-enabled on mainnet, landing straight in the vault.",
      "Private amounts using Arc's confidential transfers, once they are ready to build on.",
      "A pilot on a real company's treasury instead of a test wallet.",
    ],
  },
];

export interface FaqItem {
  id: string;
  q: string;
  /** Paragraphs, in order. */
  a: string[];
}

export const FAQ: FaqItem[] = [
  {
    id: "what-is-arcurrent",
    q: "What is Arcurrent?",
    a: [
      "Two things that work together. MandateEscrow is an open, permissionless escrow contract on Arc: anyone can lock USDC for someone, the other side posts proof, and the funder releases it. The treasury agent is its first real user: it watches what a company owes and pays it on time, from an on-chain vault, with no human clicking approve.",
    ],
  },
  {
    id: "what-is-a-mandate",
    q: "What is a mandate?",
    a: [
      "One escrowed payment. A funder locks USDC in the contract for a named fulfiller, or leaves it open to whoever proves the work first. The fulfiller posts a hash of their proof. The funder then releases the money, all at once or split across several addresses in a single transaction. If nobody delivers before an optional deadline, the funder can take a refund. Every outcome updates an on-chain reputation record for the fulfiller.",
    ],
  },
  {
    id: "who-can-use-it",
    q: "Who can use MandateEscrow? Do I have to be an Arc project?",
    a: [
      "Anyone. There is no owner, no allowlist and no fee. You do not have to be built on Arc, but the contract lives on Arc mainnet, so the transaction that calls it has to be sent there: you need a wallet with a little USDC on Arc. Use the dashboard with a browser wallet, the TypeScript SDK from code, or the MCP server from an AI agent.",
    ],
  },
  {
    id: "what-is-the-vault",
    q: "What is the AgentVault, and why does the agent need one?",
    a: [
      "The treasury the agent pays from. The money sits in a contract, not in the agent's wallet. The owner, a wallet you control, sets a per-payment cap, a daily cap that refills continuously, an optional list of payees the agent may pay, and a pause switch. The agent's wallet can call exactly one function, pay, inside those rules, and can never withdraw.",
    ],
  },
  {
    id: "keys-leak",
    q: "What happens if the agent's keys leak?",
    a: [
      "The damage is bounded by numbers the owner chose. Someone holding the agent's credentials can only pay inside the caps and to allowed payees, cannot withdraw, and can be cut off at once by pausing the vault or replacing the operator. If the owner wallet leaks, the vault is lost, which is why the owner should be a hardware wallet or multisig and the vault should hold a small balance.",
    ],
  },
  {
    id: "can-i-lose-money",
    q: "Can I lose money?",
    a: [
      "Yes, and these are the real ways. A funder can withhold a release after a fulfiller has posted proof, because there is deliberately no arbitration. The contracts are not professionally audited. USDC is issued by Circle, which can freeze an address. And a wrong address or amount is final once it is on-chain. Start with cents.",
    ],
  },
  {
    id: "audited",
    q: "Is it audited?",
    a: [
      "No. It has been self-reviewed: static analysis with slither, unit and fuzz tests, a mutation check where the contracts were deliberately broken and the tests caught every break, and rehearsals against live chains. The source of both contracts is verified on Arc's explorer, so anyone can read exactly what runs. An independent review is on the roadmap.",
    ],
  },
  {
    id: "add-obligation",
    q: "Why can't I add an obligation from the dashboard?",
    a: [
      "That form spends the project's own treasury, so it needs an owner passcode. Everyone else uses the wallet panel at the top of the dashboard, which only ever spends their own money, or makes a payment-request link to get paid.",
    ],
  },
  {
    id: "real-money",
    q: "Do I need real money to try it?",
    a: [
      "The live site runs on Arc mainnet, so yes, but the amounts can be tiny: a mandate of one cent works, and gas on Arc is paid in USDC and costs a fraction of a cent. For free experiments the SDK and scripts can target Arc testnet, where the faucet hands out test USDC.",
    ],
  },
  {
    id: "how-proof-works",
    q: "How does proof work?",
    a: [
      "The fulfiller submits a fingerprint, a keccak256 hash, of their evidence: a link, a description or a file's hash. Only the hash goes on-chain. Anyone who holds the evidence can paste it on the mandate's page and the browser checks it against the on-chain hash. Nothing is uploaded.",
    ],
  },
  {
    id: "ai-agents",
    q: "Can an AI agent use this?",
    a: [
      "Yes. The MCP server exposes mandates and reputation as tools. In vault mode its only payment tool is vault_pay, which the vault's on-chain rules bound, so an agent can be given real spending power without being handed a whole wallet. The SDK offers the same from code.",
    ],
  },
  {
    id: "why-arc",
    q: "Why Arc?",
    a: [
      "Gas is paid in USDC, so the money being moved and the fee are the same asset, and finality is under a second. That makes a payment per mandate, and a balance check every few minutes, cheap enough to be practical.",
    ],
  },
  {
    id: "verify",
    q: "How can I check any of this myself?",
    a: [
      "Every payment links to Arc's explorer, both contracts' source is verified there, and the mandate, address and vault figures on this site are read straight from the chain, not from a database. The pitch deck lists real transaction hashes you can open.",
    ],
  },
  {
    id: "not-finished",
    q: "What is not finished?",
    a: [
      "Bills in currencies other than USDC are flagged but not auto-settled, because StableFX access is gated. The cross-chain top-up is disabled on mainnet until a funded source wallet exists. The SDK and MCP server are built and tested but not on npm yet. The roadmap above is the full list.",
    ],
  },
];

/** schema.org FAQPage structured data, built from the same words the page shows. */
export function faqJsonLd(items: FaqItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a.join(" ") },
    })),
  };
}
