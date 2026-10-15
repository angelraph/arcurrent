import { getActiveArcNetwork } from "@arcurrent/shared";
import { getMandatesWithReputation, getRecentDecisions, getVaultOverview } from "@/lib/data";
import { displayAction } from "@/lib/decision-display";
import { ExploreGrid } from "../landing-sections";
import {
  Audience,
  ClosingCta,
  HeroV2,
  Lifecycle,
  RulesPanel,
  StatsBand,
  WorstCase,
  type LandingData,
} from "../landing-v2";
import { LiveLedger, type LedgerData } from "../live-ledger";
import { Nav } from "../nav";

// The page reads the chain; refreshing it every few minutes is plenty and
// keeps the page fast instead of hitting the RPC on every visit.
export const revalidate = 300;

async function readLanding(): Promise<{ data: LandingData; ledger: LedgerData | null }> {
  const [vault, mandates, decisions] = await Promise.all([
    getVaultOverview().catch(() => null),
    getMandatesWithReputation().catch(() => null),
    getRecentDecisions(20).catch(() => null),
  ]);

  const released = mandates?.filter((m) => m.status === "Released") ?? null;
  const lastPaid = released && released.length > 0 ? [...released].sort((a, b) => b.id - a.id)[0] : null;

  const data: LandingData = {
    vault: vault
      ? {
          balanceUsdc: Number(vault.balanceUsdc),
          availableUsdc: Number(vault.availableUsdc),
          availablePercent: vault.availablePercent,
          perPaymentCapUsdc: Number(vault.perPaymentCapUsdc),
          dailyCapUsdc: Number(vault.dailyCapUsdc),
          allowlistRequired: vault.allowlistRequired,
          paused: vault.paused,
          guardianSet: !/^0x0+$/.test(vault.guardian),
        }
      : null,
    mandates: mandates ? mandates.length : null,
    released: released ? released.length : null,
    volumeUsdc: released ? released.reduce((sum, m) => sum + m.amountUsdc, 0) : null,
    lastPayment: lastPaid ? { id: lastPaid.id, amountUsdc: lastPaid.amountUsdc } : null,
  };

  const ledger: LedgerData | null =
    mandates || decisions
      ? {
          explorer: getActiveArcNetwork().blockExplorer,
          mandates: [...(mandates ?? [])].sort((a, b) => b.id - a.id).slice(0, 6),
          // The agent re-evaluates on a schedule, so identical verdicts repeat; show each distinct one once.
          decisions: (decisions ?? [])
            .filter(
              (d, i, all) =>
                all.findIndex((o) => o.obligationId === d.obligationId && displayAction(o) === displayAction(d)) === i
            )
            .slice(0, 4),
        }
      : null;

  return { data, ledger };
}

// A flaky RPC must not break the landing page: every chain-backed figure falls
// back to "n/a" rather than a number that was never read.
export default async function Home() {
  const { data, ledger } = await readLanding();
  return (
    <>
      <Nav />
      <main>
        <HeroV2 data={data} />
        <StatsBand data={data} />
        <RulesPanel data={data} />
        <WorstCase data={data} />
        <Lifecycle data={data} />
        <LiveLedger data={ledger} />
        <Audience />
        <ExploreGrid />
        <ClosingCta />
      </main>
    </>
  );
}
