import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Revisiting a page within 30s is instant; server actions still invalidate via revalidatePath.
    staleTimes: { dynamic: 30 },
  },
};

export default nextConfig;
