import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The PDF route reads its font files from disk at render time, so tracing
  // cannot infer them from imports. Without this they are missing in a
  // serverless deployment and every amount renders as a blank box.
  outputFileTracingIncludes: {
    "/share/[publicSlug]/download": ["src/lib/pdf/fonts/**/*"],
  },

  experimental: {
    /**
     * How long the browser may reuse a page it has already loaded.
     *
     * Next 15 changed the `dynamic` default to 0, which means every one of
     * these pages is refetched from the server on every navigation - clicking
     * Documents, then Dashboard, then Documents again pays the full round trip
     * three times, even though nothing changed in between.
     *
     * Raising it is safe here because every mutation in this app calls
     * revalidatePath (see the server actions under src/app/dashboard), which
     * drops the browser's copy of the affected routes immediately. So the
     * window below only ever serves data that nothing in this app has changed.
     * Raise `dynamic` for snappier navigation, lower it if the workspace is
     * edited from several devices at once.
     */
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
