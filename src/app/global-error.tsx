"use client"

/**
 * Last-resort boundary: catches errors thrown by the root layout itself,
 * which route-level error.tsx cannot. It replaces the whole document, so it
 * must render its own <html>/<body> and cannot rely on app styles.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1.5rem", textAlign: "center" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
          Something went wrong
        </h2>
        <p style={{ color: "#6b7280", marginBottom: "1.5rem" }}>
          The application failed to start.{error.digest ? ` Reference: ${error.digest}` : ""}
        </p>
        <button
          onClick={reset}
          style={{ padding: "0.5rem 1rem", borderRadius: 6, border: "1px solid #d1d5db", cursor: "pointer" }}
        >
          Try again
        </button>
      </body>
    </html>
  )
}
