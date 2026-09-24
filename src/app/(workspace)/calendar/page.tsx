import { CalendarDays } from "lucide-react"

export const metadata = { title: "Calendar" }

/**
 * Placeholder, so the shell's Calendar link leads somewhere honest instead of
 * a 404 while the module is still ahead of us. It states what it will hold
 * rather than pretending to be a calendar with nothing in it.
 */
export default function CalendarPage() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center border-b border-border px-4">
        <h1 className="text-sm font-medium">Calendar</h1>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <CalendarDays className="size-5 text-muted-foreground" strokeWidth={1.5} />
        <p className="text-sm text-foreground">Not built yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          This will hold your follow-ups, meetings and invoice due dates in one view, with
          Google Calendar sync as a later phase. The follow-up dates already recorded against
          your deals are what it will read.
        </p>
      </div>
    </div>
  )
}
