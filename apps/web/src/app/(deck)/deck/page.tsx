import Link from "next/link";
import Script from "next/script";

const DECK_HTML = `
<div class="slide" id="s1">
  <div class="orbit orbit-1"></div>
  <div class="orbit orbit-2"></div>
  <canvas id="trace"></canvas>
  <span class="eyebrow">Build on Arc — Checkpoint 3</span>
  <div class="logo-card"><img src="/arcurrent-logo.jpg" alt="Arcurrent" /></div>
  <p class="lede">An autonomous treasury agent that pays your company's bills, and proves every decision on-chain.</p>
  <div class="footer-row" style="justify-content:center;">
    <span class="tag">DeFi track</span>
    <span class="tag">Agentic Economy track</span>
  </div>
</div>

<div class="slide" id="s2">
  <span class="slide-index">02 / 12</span>
  <span class="eyebrow">The problem</span>
  <h1>Treasury payments run on trust, not proof.</h1>
  <div class="problem-layout">
    <ol class="points">
      <li><span class="dot"></span><div><h3>No custody without a chaperone</h3><p>An agent that's supposed to act alone still needs a human to hold the keys or approve the transfer.</p></div></li>
      <li><span class="dot"></span><div><h3>No provable record</h3><p>A wrong payment is a support ticket and a spreadsheet, not a transaction anyone outside the company can check.</p></div></li>
      <li><span class="dot"></span><div><h3>No settlement fast enough to watch closely</h3><p>If checking a balance costs almost as much as the payment, nobody checks it often enough to catch problems early.</p></div></li>
    </ol>
    <div class="stat-card">
      <div class="num">1&ndash;5 days</div>
      <div class="cap">typical settlement time for a cross-border business wire through correspondent banking</div>
    </div>
  </div>
</div>

<div class="slide" id="s3">
  <span class="slide-index">03 / 12</span>
  <span class="eyebrow">The answer</span>
  <h1>A ledger-writing machine, not a script with a cron job.</h1>
  <p class="lede">
    Arcurrent reads what's owed, decides from the real treasury balance, the due date, and a reserve
    floor, and settles in USDC, or bridges in more USDC first if the balance would run short.
  </p>
  <p>Nothing here is simulated. Every figure on the next slide is a real transaction hash, not a mock.</p>
</div>

<div class="slide" id="s4">
  <span class="slide-index">04 / 12</span>
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
      <span class="desc">4.00 USDC burned on Base Sepolia via Circle's App Kit</span>
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
      <span class="figure">0x2ec3&hellip;5586fb</span>
    </div>
  </div>
</div>

<div class="slide" id="s5">
  <span class="slide-index">05 / 12</span>
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
      <h3>App Kit &middot; Bridge (CCTP)</h3>
      <p>Circle's App Kit SDK, <code>kit.bridge()</code>: real cross-chain USDC top-ups when a payment would breach the reserve floor.</p>
    </div>
    <div class="card">
      <h3>x402 nanopayments</h3>
      <p>The agent pays a sub-cent fee for the live FX rate it needs before acting on a foreign bill.</p>
    </div>
  </div>
</div>

<div class="slide" id="s6">
  <span class="slide-index">06 / 12</span>
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
  <span class="slide-index">07 / 12</span>
  <span class="eyebrow">Why now</span>
  <h1>The money already moved on-chain. The agent didn't.</h1>
  <p class="lede">
    USDC already sits in real company treasuries as real settlement money. What's been missing isn't
    the rail, it's an agent trustworthy enough to be handed the keys and left alone.
  </p>
  <p>Arc is the first L1 built specifically so that agent doesn't need a human chaperone: USDC-native gas, sub-second finality, and a Circle stack built for custody without a human touching a key.</p>
</div>

<div class="slide" id="s8">
  <span class="slide-index">08 / 12</span>
  <span class="eyebrow">Status</span>
  <h1>What's real, what's gated.</h1>
  <ul class="plain" style="max-width: 640px;">
    <li><span class="status-pill ok">real</span><span class="v">Wallets, escrow contract, CCTP bridge, x402 nanopayments, autonomous cron, webhook-confirmed settlement</span></li>
    <li><span class="status-pill gap">gated</span><span class="v">StableFX: RFQ-only access, no self-serve signup yet. Non-USDC obligations are correctly flagged, not yet auto-settled.</span></li>
  </ul>
</div>

<div class="slide" id="s9">
  <span class="slide-index">09 / 12</span>
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

<div class="slide" id="s10">
  <span class="slide-index">10 / 12</span>
  <span class="eyebrow">What's next</span>
  <h1>Where the accelerator runway goes.</h1>
  <div class="kv-line"><span class="k">StableFX</span><span class="v">Auto-settle non-USDC obligations once access lands</span></div>
  <div class="kv-line"><span class="k">App Kit</span><span class="v">Today it's Bridge. Swap and Unified Balance are the same SDK, next.</span></div>
  <div class="kv-line"><span class="k">Liquidity</span><span class="v">More source chains beyond Base Sepolia</span></div>
  <div class="kv-line"><span class="k">Pilot</span><span class="v">A real company's treasury, not a test wallet</span></div>
</div>

<div class="slide" id="s11">
  <span class="slide-index">11 / 12</span>
  <span class="eyebrow">The ask</span>
  <h1>What we're looking for.</h1>
  <div class="ask-list">
    <div class="ask-item"><span class="mark">01</span><div><h3>A place in Arc's accelerator</h3><p>Eight weeks to take this from a hackathon build to something a real treasury team could actually run.</p></div></div>
    <div class="ask-item"><span class="mark">02</span><div><h3>StableFX access</h3><p>The one piece that's flagged, not faked. This closes the last gap between "correctly identifies" and "fully autonomous."</p></div></div>
    <div class="ask-item"><span class="mark">03</span><div><h3>An introduction to a real treasury</h3><p>Not another test wallet. A team with genuine recurring cross-border USDC obligations to pilot against.</p></div></div>
  </div>
</div>

<div class="slide" id="s12" style="text-align:center; align-items:center;">
  <span class="slide-index">12 / 12</span>
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
    var v = getComputedStyle(document.documentElement).getPropertyValue("--teal").trim();
    return v || "#12886f";
  }
  var t = 0;
  function draw() {
    ctx.clearRect(0, 0, w, h);
    var color = accent();
    var midY = h * 0.62;
    var amp = h * 0.05;
    ctx.beginPath();
    for (var x = 0; x <= w; x += 4) {
      var y = midY + Math.sin((x + t) * 0.012) * amp * Math.sin((x + t) * 0.0021);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    var pulseX = (t * 1.4) % w;
    var pulseIndex = Math.floor(pulseX / 4) * 4;
    var py = midY + Math.sin((pulseIndex + t) * 0.012) * amp * Math.sin((pulseIndex + t) * 0.0021);
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(pulseX, py, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (!reduceMotion) { t += 1.2; requestAnimationFrame(draw); }
  }
  draw();
})();
`;

export default function DeckPage() {
  return (
    <>
      <style>{`
        :root {
          --paper: #f5f6f5;
          --paper-raised: #ffffff;
          --ink: #101c2c;
          --ink-soft: #57626f;
          --line: #dde1e1;
          --teal: #12886f;
          --teal-fill: #e1f2ee;
          --copper: #a8672e;
          --copper-fill: #f2e4d4;
          --shadow: 0 1px 2px rgba(16, 28, 44, 0.06), 0 10px 28px rgba(16, 28, 44, 0.07);
        }

        @media (prefers-color-scheme: dark) {
          :root {
            --paper: #0b121c;
            --paper-raised: #131e2c;
            --ink: #eef1f4;
            --ink-soft: #99a5b3;
            --line: #253243;
            --teal: #3ed6b3;
            --teal-fill: #103029;
            --copper: #e0a262;
            --copper-fill: #38271a;
            --shadow: 0 1px 2px rgba(0, 0, 0, 0.35), 0 14px 32px rgba(0, 0, 0, 0.4);
          }
        }
        :root[data-theme="dark"] {
          --paper: #0b121c; --paper-raised: #131e2c; --ink: #eef1f4; --ink-soft: #99a5b3;
          --line: #253243; --teal: #3ed6b3; --teal-fill: #103029; --copper: #e0a262;
          --copper-fill: #38271a; --shadow: 0 1px 2px rgba(0, 0, 0, 0.35), 0 14px 32px rgba(0, 0, 0, 0.4);
        }
        :root[data-theme="light"] {
          --paper: #f5f6f5; --paper-raised: #ffffff; --ink: #101c2c; --ink-soft: #57626f;
          --line: #dde1e1; --teal: #12886f; --teal-fill: #e1f2ee; --copper: #a8672e;
          --copper-fill: #f2e4d4; --shadow: 0 1px 2px rgba(16, 28, 44, 0.06), 0 10px 28px rgba(16, 28, 44, 0.07);
        }

        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: var(--paper); color: var(--ink); }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 17px;
          line-height: 1.65;
          -webkit-font-smoothing: antialiased;
        }
        h1, h2 {
          font-family: Georgia, "Iowan Old Style", "Times New Roman", serif;
        }
        .mono, .eyebrow, .tag, .slide-index, .figure, .txhash {
          font-family: ui-monospace, "SF Mono", "Cascadia Mono", "JetBrains Mono", Consolas, "Roboto Mono", monospace;
        }

        .back-link {
          position: fixed; top: 20px; left: 20px; z-index: 10;
          font-size: 12px; text-decoration: none; color: var(--ink-soft);
          background: var(--paper-raised); border: 1px solid var(--line);
          border-radius: 3px; padding: 5px 10px;
          font-family: ui-monospace, "SF Mono", "Cascadia Mono", "JetBrains Mono", Consolas, "Roboto Mono", monospace;
        }
        .back-link:hover { color: var(--teal); }

        .slide {
          min-height: 100vh; display: flex; flex-direction: column; justify-content: center;
          gap: 26px; padding: 72px max(24px, calc(50% - 340px));
          border-bottom: 1px solid var(--line); position: relative;
        }
        .slide-index {
          position: absolute; top: 28px; right: max(24px, calc(50% - 340px));
          font-size: 12px; color: var(--ink-soft); letter-spacing: 0.06em;
        }
        .eyebrow {
          font-size: 12px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--teal);
        }
        h1 {
          font-size: clamp(2.3rem, 4.6vw, 3.4rem); line-height: 1.08; margin: 0;
          letter-spacing: -0.005em; text-wrap: balance; font-weight: 600;
        }
        h2 { font-size: clamp(1.5rem, 3vw, 2.1rem); line-height: 1.2; margin: 0; text-wrap: balance; font-weight: 600; }
        p { max-width: 62ch; margin: 0; color: var(--ink-soft); }
        p.lede { font-size: 1.2rem; color: var(--ink); line-height: 1.55; }

        .tag {
          display: inline-flex; align-items: center; gap: 8px; font-size: 13px;
          padding: 5px 10px; border: 1px solid var(--line); border-radius: 3px;
          background: var(--paper-raised); width: fit-content;
        }
        .footer-row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 6px; }
        a { color: var(--teal); }
        a.plain { color: inherit; text-decoration: none; border-bottom: 1px solid var(--line); }
        a.plain:hover { border-bottom-color: var(--teal); }

        #s1 { justify-content: center; align-items: center; text-align: center; overflow: hidden; }
        #s1 .orbit { position: absolute; border-radius: 50%; z-index: 0; opacity: 0.5; }
        #s1 .orbit-1 { width: 420px; height: 420px; background: radial-gradient(circle at 35% 35%, var(--teal-fill), transparent 70%); top: -120px; right: -100px; }
        #s1 .orbit-2 { width: 280px; height: 280px; background: radial-gradient(circle at 40% 40%, var(--copper-fill), transparent 70%); bottom: -80px; left: -60px; }
        #s1 canvas { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0; opacity: 0.35; }
        #s1 > * { position: relative; z-index: 1; }
        #s1 .logo-card {
          background: #ffffff; border-radius: 16px; padding: 18px 26px; box-shadow: var(--shadow);
          display: inline-flex; align-items: center; justify-content: center;
        }
        #s1 .logo-card img { display: block; height: 108px; width: auto; }
        #s1 p.lede { max-width: 46ch; text-align: center; }

        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        @media (max-width: 720px) { .grid-2 { grid-template-columns: 1fr; } }

        .card {
          background: var(--paper-raised); border: 1px solid var(--line); border-radius: 6px;
          padding: 20px 22px; box-shadow: var(--shadow);
        }
        .card h3 { font-size: 0.98rem; margin: 0 0 8px 0; font-weight: 600; }
        .card p { font-size: 0.95rem; margin: 0; max-width: none; }
        .card code {
          font-family: ui-monospace, "SF Mono", "Cascadia Mono", "JetBrains Mono", Consolas, "Roboto Mono", monospace;
          font-size: 0.85em; background: var(--paper); border: 1px solid var(--line); border-radius: 3px; padding: 1px 5px;
        }

        .problem-layout { display: grid; grid-template-columns: 1.3fr 1fr; gap: 28px; align-items: start; }
        @media (max-width: 720px) { .problem-layout { grid-template-columns: 1fr; } }
        ol.points { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 18px; }
        ol.points li { display: flex; gap: 14px; }
        ol.points .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--teal); margin-top: 8px; flex-shrink: 0; }
        ol.points h3 { margin: 0 0 3px 0; font-size: 1rem; font-weight: 600; }
        ol.points p { margin: 0; font-size: 0.95rem; }
        .stat-card { background: var(--paper-raised); border: 1px solid var(--line); border-radius: 6px; padding: 24px; box-shadow: var(--shadow); }
        .stat-card .num { font-family: ui-monospace, "SF Mono", "Cascadia Mono", "JetBrains Mono", Consolas, "Roboto Mono", monospace; font-size: 2.6rem; font-weight: 700; color: var(--ink); line-height: 1; }
        .stat-card .cap { margin-top: 10px; font-size: 0.85rem; color: var(--ink-soft); }

        .ledger { background: var(--paper-raised); border: 1px solid var(--line); border-radius: 6px; box-shadow: var(--shadow); overflow: hidden; }
        .ledger-row { display: grid; grid-template-columns: 90px 1fr auto; gap: 14px; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--line); font-size: 0.92rem; }
        .ledger-row:last-child { border-bottom: none; }
        .ledger-row .step { font-size: 11px; letter-spacing: 0.08em; color: var(--ink-soft); text-transform: uppercase; font-family: ui-monospace, "SF Mono", "Cascadia Mono", "JetBrains Mono", Consolas, "Roboto Mono", monospace; }
        .ledger-row .desc { color: var(--ink); }
        .ledger-row .figure { font-size: 0.85rem; color: var(--teal); text-align: right; white-space: nowrap; }
        @media (max-width: 640px) { .ledger-row { grid-template-columns: 1fr; text-align: left; } .ledger-row .figure { text-align: left; } }

        .balance-strip { display: flex; flex-direction: column; gap: 10px; }
        .balance-strip .step { display: flex; flex-direction: column; gap: 2px; }
        .balance-strip .step.move { flex-direction: row; align-items: center; gap: 8px; padding-left: 2px; }
        .balance-strip .figure { font-family: ui-monospace, "SF Mono", "Cascadia Mono", "JetBrains Mono", Consolas, "Roboto Mono", monospace; font-size: clamp(1.1rem, 3vw, 1.4rem); font-weight: 600; }
        .balance-strip .arrow { color: var(--ink-soft); font-size: 0.85rem; }
        .balance-strip .step.move .arrow { color: var(--teal); font-family: ui-monospace, "SF Mono", "Cascadia Mono", "JetBrains Mono", Consolas, "Roboto Mono", monospace; }
        .balance-strip .figure.hi { color: var(--teal); }

        ul.plain { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
        ul.plain li { display: flex; gap: 14px; align-items: baseline; }
        ul.plain .k { font-size: 0.8rem; color: var(--teal); min-width: 118px; text-transform: uppercase; letter-spacing: 0.06em; font-family: ui-monospace, "SF Mono", "Cascadia Mono", "JetBrains Mono", Consolas, "Roboto Mono", monospace; }
        ul.plain .v { color: var(--ink); }

        .kv-line { display: flex; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--line); font-size: 0.95rem; }
        .kv-line:last-child { border-bottom: none; }
        .kv-line .k { color: var(--ink); font-weight: 600; }
        .kv-line .v { color: var(--ink-soft); text-align: right; max-width: 46ch; }

        .status-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; padding: 3px 9px; border-radius: 3px; font-family: ui-monospace, "SF Mono", "Cascadia Mono", "JetBrains Mono", Consolas, "Roboto Mono", monospace; }
        .status-pill.ok { background: var(--teal-fill); color: var(--teal); }
        .status-pill.gap { background: var(--copper-fill); color: var(--copper); }

        .ask-list { display: flex; flex-direction: column; gap: 20px; }
        .ask-item { display: flex; gap: 16px; align-items: flex-start; }
        .ask-item .mark {
          font-family: ui-monospace, "SF Mono", "Cascadia Mono", "JetBrains Mono", Consolas, "Roboto Mono", monospace;
          font-size: 0.8rem; color: var(--teal); border: 1px solid var(--line); background: var(--paper-raised);
          border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; margin-top: 2px;
        }
        .ask-item h3 { margin: 0 0 3px 0; font-size: 1.02rem; font-weight: 600; }
        .ask-item p { margin: 0; font-size: 0.96rem; }

        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
      `}</style>
      <Link className="back-link" href="/">
        &larr; arcurrent
      </Link>
      <div dangerouslySetInnerHTML={{ __html: DECK_HTML }} />
      <Script id="deck-trace" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: TRACE_SCRIPT }} />
    </>
  );
}
