import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Revisiting a page within 30s is instant; server actions still invalidate via revalidatePath.
    staleTimes: { dynamic: 30 },
    // Catalog photos are uploaded through a server action.
    serverActions: { bodySizeLimit: "10mb" },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      // Marketplace thumbnails used as a fallback when a catalog item has no panel photo.
      { protocol: "https", hostname: "**.mlstatic.com" },
      { protocol: "https", hostname: "**.susercontent.com" },
    ],
  },
};

export default nextConfig;
