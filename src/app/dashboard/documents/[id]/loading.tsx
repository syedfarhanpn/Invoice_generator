import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="h-[calc(100vh-8rem)] w-full -m-4 md:-m-8">
      <div className="flex h-full flex-col md:flex-row overflow-hidden">
        {/* editor rail */}
        <div className="flex h-full w-full flex-col border-r bg-background md:w-[440px] lg:w-[480px]">
          <div className="flex items-center justify-between border-b p-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-8 w-20 rounded-md" />
          </div>
          <div className="space-y-5 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
            ))}
          </div>
        </div>
        {/* preview pane */}
        <div className="hidden flex-1 items-start justify-center bg-muted/40 p-8 md:flex">
          <Skeleton className="h-full w-full max-w-2xl rounded-lg" />
        </div>
      </div>
    </div>
  )
}
