import { getMandatesWithReputation } from "@/lib/data";
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

export default async function Home() {
  const stats = await readLiveStats();
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <LiveStrip stats={stats} />
        <HowItWorks />
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
