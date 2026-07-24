import { Explainer } from "../explainer";
import { Hero } from "../hero";
import { Nav } from "../nav";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <Nav />
      <Hero />
      <Explainer />
    </div>
  );
}
