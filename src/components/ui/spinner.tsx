import { LoaderCircle } from "lucide-react"

import { cn } from "@/lib/utils"

/** Round indeterminate loader. `label` is announced to screen readers. */
function Spinner({
  className,
  label = "Loading",
  ...props
}: React.ComponentProps<typeof LoaderCircle> & { label?: string }) {
  return (
    <LoaderCircle
      data-slot="spinner"
      role="status"
      aria-label={label}
      className={cn("size-4 shrink-0 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
