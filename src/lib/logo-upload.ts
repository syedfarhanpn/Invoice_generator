/**
 * Rules for the business logo. Pure and shared by both sides of the upload:
 * the browser checks before spending bandwidth, and the server action checks
 * again before trusting anything. The bucket enforces the same limits a third
 * time in Postgres (see the logo_storage migration).
 */

export const LOGO_BUCKET = "business-logos"

/** Matches the bucket's file_size_limit. */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024

/**
 * SVG is excluded on purpose: the bucket is public-read so anonymous invoice
 * recipients can load the logo, and an SVG can carry script.
 */
export const LOGO_ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"] as const

const EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
}

export function logoExtension(mimeType: string): string | null {
  return EXTENSION[mimeType] ?? null
}

/** Returns an error message, or null when the file is acceptable. */
export function validateLogo(file: { type: string; size: number }): string | null {
  if (!LOGO_ALLOWED_TYPES.includes(file.type as (typeof LOGO_ALLOWED_TYPES)[number])) {
    return "Use a PNG, JPG or WebP image."
  }
  if (file.size <= 0) return "That file is empty."
  if (file.size > LOGO_MAX_BYTES) {
    return `Logo must be under ${Math.floor(LOGO_MAX_BYTES / 1024 / 1024)} MB.`
  }
  return null
}

/** Storage path for a tenant's logo. The first segment is the RLS boundary. */
export function logoObjectPath(authUserId: string, mimeType: string): string | null {
  const ext = logoExtension(mimeType)
  if (!ext) return null
  // Timestamped so a replacement gets a fresh URL and never serves a stale
  // logo from a CDN or browser cache.
  return `${authUserId}/logo-${Date.now()}.${ext}`
}

/**
 * Confirms a public URL really points at this tenant's own object in our
 * bucket. The browser performs the upload, so the URL it hands back to the
 * server is untrusted input - without this, a crafted value could point the
 * logo at any address.
 */
export function isOwnLogoUrl(url: string, supabaseUrl: string, authUserId: string): boolean {
  const expectedPrefix = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${LOGO_BUCKET}/${authUserId}/`
  if (!url.startsWith(expectedPrefix)) return false
  // Reject traversal or nested paths that could climb out of the folder.
  const rest = url.slice(expectedPrefix.length)
  return rest.length > 0 && !rest.includes("/") && !rest.includes("..")
}
