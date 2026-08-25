import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center bg-muted/40 p-4 md:p-8">
      <div className="mb-6 flex w-full max-w-[800px] items-center justify-between">
        <Skeleton className="h-6 w-44" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
      </div>
      <Skeleton className="h-[900px] w-full max-w-[800px] rounded-lg" />
    </div>
  )
}
