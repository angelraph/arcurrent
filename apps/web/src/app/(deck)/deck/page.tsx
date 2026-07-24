import Link from "next/link";
import Script from "next/script";

const DECK_HTML = `
<div class="slide" id="s1">
  <canvas id="trace"></canvas>
  <span class="eyebrow">Build on Arc — Checkpoint 3</span>
  <div class="wordmark">ARCURRENT</div>
  <p class="lede">An autonomous treasury agent that pays your company's bills, and proves every decision on-chain.</p>
  <div class="footer-row" style="justify-content:center;">
    <span class="tag">DeFi track</span>
    <span class="tag">Agentic Economy track</span>
  </div>
</div>

<div class="slide" id="s2">
  <span class="slide-index">02 / 10</span>
  <span class="eyebrow">The problem</span>
  <h1>Autonomous payments need more than an API key.</h1>
  <p class="lede">
    A payment agent that acts on a schedule, with no one watching, can't rely on a human authorizing
    each transfer. It needs to hold funds it can prove it controls, leave a record precise enough that
    a wrong payment is provable rather than trusted, and settle cheaply enough that checking a balance
    every few minutes doesn't cost more than the payments themselves.
  </p>
</div>

<div class="slide" id="s3">
  <span class="slide-index">03 / 10</span>
  <span class="eyebrow">The answer</span>
  <h1>A ledger-writing machine, not a script with a cron job.</h1>
  <p class="lede">
    Arcurrent reads what's owed, decides from the real treasury balance, the due date, and a reserve
    floor, and settles in USDC — or bridges in more USDC first if the balance would run short.
  </p>
  <p>Nothing here is simulated. Every figure on the next slide is a real transaction hash, not a mock.</p>
</div>

<div class="slide" id="s4">
  <span class="slide-index">04 / 10</span>
  <span class="eyebrow">Proof</span>
  <h1>One evaluation pass, four real transactions.</h1>
  <p>Obligation: $5.00 USDC, due 2026&#8209;07&#8209;24. Reserve floor: $15.00.</p>

  <div class="balance-strip">
    <div class="step"><span class="figure">$15.999994</span><span class="arrow">escrow balance: too low to pay without breaking the $15.00 floor</span></div>
    <div class="step move"><span class="arrow">&darr; bridges in $4.00 USDC from Base Sepolia</span></div>
    <div class="step"><span class="figure hi">$20.00</span><span class="arrow">escrow balance after the top-up</span></div>
    <div class="step move"><span class="arrow">&darr; settles the $5.00 obligation</span></div>
    <div class="step"><span class="figure">$15.00</span><span class="arrow">reserve floor, exactly</span></div>
  </div>

  <div class="ledger">
    <div class="ledger-row">
      <span class="step">Approve</span>
      <span class="desc">USDC spend approved on Base Sepolia for the CCTP burn</span>
      <span class="figure">0xdef5…3c7dd</span>
    </div>
    <div class="ledger-row">
      <span class="step">Burn</span>
      <span class="desc">4.00 USDC burned on Base Sepolia via Circle's Bridge Kit</span>
      <span class="figure">0xb606…f3dc0</span>
    </div>
    <div class="ledger-row">
      <span class="step">Mint</span>
      <span class="desc">4.00 USDC minted into the treasury wallet on Arc Testnet</span>
      <span class="figure">0xa6b2…934e6c0</span>
    </div>
    <div class="ledger-row">
      <span class="step">Deposit</span>
      <span class="desc">Bridged USDC deposited into the ObligationEscrow contract</span>
      <span class="figure">736d79cd&hellip;80637c</span>
    </div>
    <div class="ledger-row">
      <span class="step">Settle</span>
      <span class="desc">Obligation paid on the next evaluation pass, reserve floor intact</span>
      <span class="figure">1558da7e&hellip;496a03</span>
    </div>
  </div>
</div>

<div class="slide" id="s5">
  <span class="slide-index">05 / 10</span>
  <span class="eyebrow">How it works</span>
  <h1>Four real primitives, one decision loop.</h1>
  <div class="grid-2">
    <div class="card">
      <h3>Developer-Controlled Wallets</h3>
      <p>The treasury and liquidity wallets are Circle-custodied. No private key lives in this codebase.</p>
    </div>
    <div class="card">
      <h3>ObligationEscrow</h3>
      <p>A deployed contract on Arc Testnet holds the treasury's USDC; only the agent's wallet can withdraw.</p>
    </div>
    <div class="card">
      <h3>Bridge Kit &middot; CCTP</h3>
      <p>Real cross-chain USDC top-ups when a payment would breach the reserve floor.</p>
    </div>
    <div class="card">
      <h3>x402 nanopayments</h3>
      <p>The agent pays a sub-cent fee for the live FX rate it needs before acting on a foreign bill.</p>
    </div>
  </div>
</div>

<div class="slide" id="s6">
  <span class="slide-index">06 / 10</span>
  <span class="eyebrow">Why Arc</span>
  <h1>Arcurrent: current, twice.</h1>
  <p class="lede">
    Gas paid in USDC, the same money moving through the system, not a second token to keep topped up.
    Settlement under a second, so a balance check every few minutes doesn't cost more than the payments
    it's protecting.
  </p>
  <p>That's the whole bet: money that moves as fast as the decision to move it.</p>
</div>

<div class="slide" id="s7">
  <span class="slide-index">07 / 10</span>
  <span class="eyebrow">Status</span>
  <h1>What's real, what's gated.</h1>
  <ul class="plain" style="max-width: 640px;">
    <li><span class="status-pill ok">real</span><span class="v">Wallets, escrow contract, CCTP bridge, x402 nanopayments, autonomous cron</span></li>
    <li><span class="status-pill gap">gated</span><span class="v">StableFX: RFQ-only access, no self-serve signup yet. Non-USDC obligations are correctly flagged, not yet auto-settled.</span></li>
  </ul>
</div>

<div class="slide" id="s8">
  <span class="slide-index">08 / 10</span>
  <span class="eyebrow">Track fit</span>
  <h1>Two tracks, one agent.</h1>
  <div class="grid-2">
    <div class="card">
      <h3>DeFi</h3>
      <p>Programmable treasury, cross-chain liquidity sourcing, USDC-denominated fees end to end.</p>
    </div>
    <div class="card">
      <h3>Agentic Economy</h3>
      <p>Real autonomy: the agent decides, pays for its own inputs, and settles without a human in the loop.</p>
    </div>
  </div>
</div>

<div class="slide" id="s9">
  <span class="slide-index">09 / 10</span>
  <span class="eyebrow">What's next</span>
  <h1>Where the accelerator runway goes.</h1>
  <div class="kv-line"><span class="k">StableFX</span><span class="v">Auto-settle non-USDC obligations once access lands</span></div>
  <div class="kv-line"><span class="k">Liquidity</span><span class="v">More source chains beyond Base Sepolia</span></div>
  <div class="kv-line"><span class="k">Pilot</span><span class="v">A real company's treasury, not a test wallet</span></div>
</div>

<div class="slide" id="s10" style="text-align:center; align-items:center;">
  <span class="slide-index">10 / 10</span>
  <span class="eyebrow">See it settle</span>
  <h1>Thank you.</h1>
  <div class="footer-row" style="justify-content:center;">
    <a class="plain mono" href="/dashboard">Open the live dashboard &rarr;</a>
  </div>
  <div class="footer-row" style="justify-content:center;">
    <a class="plain mono" href="https://github.com/angelraph/arcurrent" target="_blank" rel="noreferrer">github.com/angelraph/arcurrent</a>
  </div>
</div>
`;

const TRACE_SCRIPT = `
(function () {
  var canvas = document.getElementById("trace");
  if (!canvas) return;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var ctx = canvas.getContext("2d");
  var w, h, dpr;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    w = canvas.parentElement.clientWidth;
    h = canvas.parentElement.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);

  function accent() {
    var v = getComputedStyle(document.documentElement).getPropertyValue("--copper").trim();
    return v || "#a85a26";
  }

  var t = 0;
  function draw() {
    ctx.clearRect(0, 0, w, h);
    var color = accent();
    var midY = h * 0.55;
    var amp = h * 0.06;
    ctx.beginPath();
    for (var x = 0; x <= w; x += 4) {
      var y = midY + Math.sin((x + t) * 0.012) * amp * Math.sin((x + t) * 0.0021);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    var pulseX = (t * 1.4) % w;
    var pulseIndex = Math.floor(pulseX / 4) * 4;
    var py = midY + Math.sin((pulseIndex + t) * 0.012) * amp * Math.sin((pulseIndex + t) * 0.0021);
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(pulseX, py, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;

    if (!reduceMotion) {
      t += 1.2;
      requestAnimationFrame(draw);
    }
  }
  draw();
})();
`;

export default function DeckPage() {
  return (
    <>
      <style>{`
        :root {
          --paper: #f4f5f7;
          --paper-raised: #ffffff;
          --ink: #14161f;
          --ink-soft: #4a4f5c;
          --line: #d8dbe1;
          --copper: #a85a26;
          --copper-fill: #f0e2d3;
          --signal: #1f8f79;
          --signal-fill: #dcf1ec;
          --shadow: 0 1px 2px rgba(20, 22, 31, 0.06), 0 8px 24px rgba(20, 22, 31, 0.06);
        }

        @media (prefers-color-scheme: dark) {
          :root {
            --paper: #10131c;
            --paper-raised: #171b27;
            --ink: #e9eaf0;
            --ink-soft: #9aa0b0;
            --line: #2a2f3d;
            --copper: #e19b5f;
            --copper-fill: #2e2013;
            --signal: #5fd6bb;
            --signal-fill: #12281f;
            --shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 12px 32px rgba(0, 0, 0, 0.35);
          }
        }

        :root[data-theme="dark"] {
          --paper: #10131c;
          --paper-raised: #171b27;
          --ink: #e9eaf0;
          --ink-soft: #9aa0b0;
          --line: #2a2f3d;
          --copper: #e19b5f;
          --copper-fill: #2e2013;
          --signal: #5fd6bb;
          --signal-fill: #12281f;
          --shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 12px 32px rgba(0, 0, 0, 0.35);
        }

        :root[data-theme="light"] {
          --paper: #f4f5f7;
          --paper-raised: #ffffff;
          --ink: #14161f;
          --ink-soft: #4a4f5c;
          --line: #d8dbe1;
          --copper: #a85a26;
          --copper-fill: #f0e2d3;
          --signal: #1f8f79;
          --signal-fill: #dcf1ec;
          --shadow: 0 1px 2px rgba(20, 22, 31, 0.06), 0 8px 24px rgba(20, 22, 31, 0.06);
        }

        * { box-sizing: border-box; }

        html, body {
          margin: 0;
          padding: 0;
          background: var(--paper);
          color: var(--ink);
        }

        body {
          font-family: Charter, "Iowan Old Style", Georgia, "Times New Roman", serif;
          font-size: 17px;
          line-height: 1.65;
          -webkit-font-smoothing: antialiased;
        }

        .mono, .eyebrow, .tag, .slide-index, h1, h2, .figure, .txhash, .kicker {
          font-family: ui-monospace, "SF Mono", "Cascadia Mono", "JetBrains Mono", Consolas, "Roboto Mono", monospace;
        }

        .back-link {
          position: fixed;
          top: 20px;
          left: 20px;
          z-index: 10;
          font-size: 12px;
          text-decoration: none;
          color: var(--ink-soft);
          background: var(--paper-raised);
          border: 1px solid var(--line);
          border-radius: 3px;
          padding: 5px 10px;
        }
        .back-link:hover { color: var(--copper); }

        .slide {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 28px;
          padding: 72px max(24px, calc(50% - 340px));
          border-bottom: 1px solid var(--line);
          position: relative;
        }

        .slide-index {
          position: absolute;
          top: 28px;
          right: max(24px, calc(50% - 340px));
          font-size: 12px;
          color: var(--ink-soft);
          letter-spacing: 0.06em;
        }

        .eyebrow {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--copper);
        }

        h1 {
          font-size: clamp(2.4rem, 5vw, 3.6rem);
          line-height: 1.05;
          margin: 0;
          letter-spacing: -0.01em;
          text-wrap: balance;
        }

        h2 {
          font-size: clamp(1.6rem, 3.4vw, 2.3rem);
          line-height: 1.15;
          margin: 0;
          letter-spacing: -0.01em;
          text-wrap: balance;
        }

        p {
          max-width: 62ch;
          margin: 0;
          color: var(--ink-soft);
        }

        p.lede {
          font-size: 1.25rem;
          color: var(--ink);
        }

        .tag {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          padding: 5px 10px;
          border: 1px solid var(--line);
          border-radius: 3px;
          background: var(--paper-raised);
          width: fit-content;
        }

        .footer-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 6px;
        }

        a { color: var(--copper); }
        a.plain { color: inherit; text-decoration: none; border-bottom: 1px solid var(--line); }
        a.plain:hover { border-bottom-color: var(--copper); }

        #s1 { justify-content: center; align-items: center; text-align: center; }
        #s1 .wordmark {
          font-size: clamp(3rem, 9vw, 6rem);
          font-weight: 700;
          letter-spacing: -0.02em;
          margin: 8px 0;
        }
        #s1 canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 0;
          opacity: 0.5;
        }
        #s1 > * { position: relative; z-index: 1; }
        #s1 p.lede { max-width: 46ch; text-align: center; }

        .grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        @media (max-width: 720px) {
          .grid-2 { grid-template-columns: 1fr; }
        }

        .card {
          background: var(--paper-raised);
          border: 1px solid var(--line);
          border-radius: 4px;
          padding: 20px 22px;
          box-shadow: var(--shadow);
        }
        .card h3 {
          font-family: ui-monospace, "SF Mono", "Cascadia Mono", "JetBrains Mono", Consolas, "Roboto Mono", monospace;
          font-size: 0.95rem;
          margin: 0 0 8px 0;
        }
        .card p { font-size: 0.95rem; margin: 0; max-width: none; }

        .ledger {
          background: var(--paper-raised);
          border: 1px solid var(--line);
          border-radius: 4px;
          box-shadow: var(--shadow);
          overflow: hidden;
        }
        .ledger-row {
          display: grid;
          grid-template-columns: 90px 1fr auto;
          gap: 14px;
          align-items: center;
          padding: 14px 18px;
          border-bottom: 1px solid var(--line);
          font-size: 0.92rem;
        }
        .ledger-row:last-child { border-bottom: none; }
        .ledger-row .step {
          font-size: 11px;
          letter-spacing: 0.08em;
          color: var(--ink-soft);
          text-transform: uppercase;
        }
        .ledger-row .desc { color: var(--ink); }
        .ledger-row .figure {
          font-size: 0.85rem;
          color: var(--signal);
          text-align: right;
          white-space: nowrap;
        }
        @media (max-width: 640px) {
          .ledger-row { grid-template-columns: 1fr; text-align: left; }
          .ledger-row .figure { text-align: left; }
        }

        .balance-strip {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .balance-strip .step {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .balance-strip .step.move {
          flex-direction: row;
          align-items: center;
          gap: 8px;
          padding-left: 2px;
        }
        .balance-strip .figure { font-size: clamp(1.1rem, 3vw, 1.4rem); font-weight: 600; }
        .balance-strip .arrow { color: var(--ink-soft); font-size: 0.85rem; }
        .balance-strip .step.move .arrow { color: var(--copper); }
        .balance-strip .figure.hi { color: var(--signal); }

        ul.plain { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
        ul.plain li { display: flex; gap: 14px; align-items: baseline; }
        ul.plain .k { font-size: 0.8rem; color: var(--copper); min-width: 118px; text-transform: uppercase; letter-spacing: 0.06em; }
        ul.plain .v { color: var(--ink); font-family: Charter, Georgia, serif; }

        .kv-line {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 0;
          border-bottom: 1px solid var(--line);
          font-size: 0.95rem;
        }
        .kv-line:last-child { border-bottom: none; }
        .kv-line .k { color: var(--ink-soft); }
        .kv-line .v { color: var(--ink); text-align: right; }

        .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          padding: 3px 9px;
          border-radius: 3px;
        }
        .status-pill.ok { background: var(--signal-fill); color: var(--signal); }
        .status-pill.gap { background: var(--copper-fill); color: var(--copper); }

        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; transition: none !important; }
        }
      `}</style>
      <Link className="back-link" href="/">
        &larr; arcurrent
      </Link>
      <div dangerouslySetInnerHTML={{ __html: DECK_HTML }} />
      <Script id="deck-trace" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: TRACE_SCRIPT }} />
    </>
  );
}
