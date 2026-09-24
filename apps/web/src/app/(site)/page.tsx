import { getActiveArcNetwork } from "@arcurrent/shared";
import { getMandatesWithReputation, getRecentDecisions } from "@/lib/data";
import { formatUsdc } from "@/lib/format";
import { Hero } from "../hero";
import {
  BoundedAutonomy,
  BuildOnIt,
  HowItWorks,
  LiveStrip,
  UnderTheHood,
  WhyArc,
  type LiveStats,
} from "../landing-sections";
import { LiveLedger, type LedgerData } from "../live-ledger";
import { Nav } from "../nav";
import { Faq, Roadmap } from "../roadmap-faq";

// The strip reads the chain; refreshing it every few minutes is plenty and
// keeps the page fast instead of hitting the RPC on every visit.
export const revalidate = 300;

async function readLiveStats(): Promise<LiveStats | null> {
  try {
    const mandates = await getMandatesWithReputation();
    const released = mandates.filter((m) => m.status === "Released");
    const volume = released.reduce((sum, m) => sum + m.amountUsdc, 0);
    return { mandates: mandates.length, released: released.length, volumeUsdc: formatUsdc(volume) };
  } catch {
    // A flaky RPC must not break the landing page; the strip shows placeholders instead of a number.
    return null;
  }
}

async function readLedger(): Promise<LedgerData | null> {
  try {
    const [mandates, decisions] = await Promise.all([
      getMandatesWithReputation().catch(() => []),
      getRecentDecisions(20).catch(() => []),
    ]);
    return {
      explorer: getActiveArcNetwork().blockExplorer,
      mandates: [...mandates].sort((a, b) => b.id - a.id).slice(0, 6),
      // The agent re-evaluates on a schedule, so identical verdicts repeat; show each distinct one once.
      decisions: decisions
        .filter((d, i, all) => all.findIndex((o) => o.obligationId === d.obligationId && o.action === d.action) === i)
        .slice(0, 4),
    };
  } catch {
    return null;
  }
}

export default async function Home() {
  const [stats, ledger] = await Promise.all([readLiveStats(), readLedger()]);
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <LiveStrip stats={stats} />
        <HowItWorks />
        <LiveLedger data={ledger} />
        <WhyArc />
        <BoundedAutonomy />
        <UnderTheHood />
        <BuildOnIt />
        <Roadmap />
        <Faq />
      </main>
    </>
  );
}
