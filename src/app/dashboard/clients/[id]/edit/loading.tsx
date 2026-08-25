import { Skeleton } from "@/components/ui/skeleton"
import { FormSkeleton } from "@/components/app/skeletons"

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-9 w-52" />
        <Skeleton className="h-4 w-80" />
      </div>
      <FormSkeleton fields={8} />
    </div>
  )
}
