import { config } from "dotenv";
import path from "node:path";
import type { NextConfig } from "next";

// Monorepo root .env — Next.js only auto-loads .env files from this app's own
// directory (apps/web), not the workspace root where the shared .env lives.
config({ path: path.resolve(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
