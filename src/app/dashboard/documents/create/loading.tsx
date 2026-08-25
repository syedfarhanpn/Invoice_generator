import { Skeleton } from "@/components/ui/skeleton"

/**
 * This segment creates a draft and redirects, so it never paints its own UI -
 * without a fallback the user stares at the previous screen while the INSERT
 * runs. Mirrors the editor it is about to land on.
 */
export default function Loading() {
  return (
    <div className="h-[calc(100vh-8rem)] w-full -m-4 md:-m-8">
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <p className="text-sm text-muted-foreground">Preparing your document...</p>
      </div>
    </div>
  )
}
