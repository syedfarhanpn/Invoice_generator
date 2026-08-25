import crypto from "node:crypto"
import { headers } from "next/headers"

/**
 * A privacy-conscious fingerprint for the current request: enough to dedupe
 * repeated "viewed" events from the same visitor within a short window,
 * without storing a raw IP address anywhere.
 */
export async function getViewerFingerprint(): Promise<{ hash: string; userAgent: string }> {
  const h = await headers()
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown"
  const userAgent = h.get("user-agent") || "unknown"
  const hash = crypto.createHash("sha256").update(`${ip}|${userAgent}`).digest("hex").slice(0, 16)
  return { hash, userAgent }
}
