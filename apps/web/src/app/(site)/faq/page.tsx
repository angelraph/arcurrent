import type { Metadata } from "next";
import { Nav } from "../../nav";
import { Faq } from "../../roadmap-faq";

export const metadata: Metadata = {
  title: "FAQ · Arcurrent",
  description: "Plain answers to the questions people actually ask about custody, risk and audits on Arcurrent.",
};

export default function FaqPage() {
  return (
    <>
      <Nav />
      <main>
        <Faq />
      </main>
    </>
  );
}
