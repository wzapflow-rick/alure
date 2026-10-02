import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Revisiting a page within 30s is instant; server actions still invalidate via revalidatePath.
    staleTimes: { dynamic: 30 },
    // Catalog photos are uploaded through a server action.
    serverActions: { bodySizeLimit: "10mb" },
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
  },
};

export default nextConfig;
