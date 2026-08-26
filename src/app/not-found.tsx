import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">Page not found</h2>
        <p className="text-sm text-muted-foreground">
          That page does not exist, or the link it came from is no longer valid.
        </p>
      </div>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        Go home
      </Link>
    </div>
  )
}
