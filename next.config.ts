import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The PDF route reads its font files from disk at render time, so tracing
  // cannot infer them from imports. Without this they are missing in a
  // serverless deployment and every amount renders as a blank box.
  outputFileTracingIncludes: {
    "/share/[publicSlug]/download": ["src/lib/pdf/fonts/**/*"],
  },
};

export default nextConfig;
