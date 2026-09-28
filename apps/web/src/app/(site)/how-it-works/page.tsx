import type { Metadata } from "next";
import { BoundedAutonomy, BuildOnIt, HowItWorks, UnderTheHood, WhyArc } from "../../landing-sections";
import { Nav } from "../../nav";

export const metadata: Metadata = {
  title: "How it works · Arcurrent",
  description:
    "The four-step loop that runs the treasury agent, why it lives on Arc, what a compromised agent can and cannot do, and the stack underneath.",
};

export default function HowItWorksPage() {
  return (
    <>
      <Nav />
      <main>
        <HowItWorks />
        <WhyArc />
        <BoundedAutonomy />
        <UnderTheHood />
        <BuildOnIt />
      </main>
    </>
  );
}
