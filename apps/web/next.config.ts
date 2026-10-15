import { config } from "dotenv";
import path from "node:path";
import type { NextConfig } from "next";

// Monorepo root .env — Next.js only auto-loads .env files from this app's own
// directory (apps/web), not the workspace root where the shared .env lives.
config({ path: path.resolve(__dirname, "../../.env") });

// Response headers sent with every page. No Content-Security-Policy is set on
// purpose: wallet connectors and the wallet-connect modal load from several
// origins, and a policy that breaks sign-in is worse than none. Framing is
// refused, MIME sniffing is off, and powerful browser features are denied.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), usb=(), payment=()" },
  // Wallet extensions and connect modals open popups that must keep a handle back to the page.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
