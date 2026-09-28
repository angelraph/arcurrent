import type { Metadata } from "next";
import { Nav } from "../../nav";
import { Roadmap } from "../../roadmap-faq";

export const metadata: Metadata = {
  title: "Roadmap · Arcurrent",
  description: "What is live today, what comes next, and what has to happen before Arcurrent holds real volume.",
};

export default function RoadmapPage() {
  return (
    <>
      <Nav />
      <main>
        <Roadmap />
      </main>
    </>
  );
}
