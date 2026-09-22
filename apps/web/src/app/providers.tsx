"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi-config";

/**
 * Wagmi/React Query need to run client-side (wallet access, browser-only
 * APIs), so this is its own "use client" boundary wrapped around the site,
 * not pushed down into individual components -- every client component that
 * calls a wagmi hook needs to be inside this provider tree exactly once.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  // Created once per mount, not per render -- a fresh QueryClient every
  // render would drop wagmi's own query cache (pending tx state, etc).
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
