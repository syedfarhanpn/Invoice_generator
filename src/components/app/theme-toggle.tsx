"use client"

import { useSyncExternalStore } from "react"
import { Monitor, Moon, Sun } from "lucide-react"

import { cn } from "@/lib/utils"
import { THEME_PREFERENCES, type ThemePreference } from "@/lib/theme"
import { getPreference, getServerPreference, setPreference, subscribe } from "./theme-store"

const OPTIONS: Record<ThemePreference, { label: string; hint: string; icon: React.ComponentType<{ className?: string }> }> = {
  light: { label: "Light", hint: "Always light", icon: Sun },
  dark: { label: "Dark", hint: "Always dark", icon: Moon },
  system: { label: "System", hint: "Follow my device", icon: Monitor },
}

export function ThemeToggle() {
  const preference = useSyncExternalStore(subscribe, getPreference, getServerPreference)

  return (
    <div role="radiogroup" aria-label="Colour theme" className="grid gap-3 sm:grid-cols-3">
      {THEME_PREFERENCES.map((value) => {
        const { label, hint, icon: Icon } = OPTIONS[value]
        const selected = preference === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setPreference(value)}
            className={cn(
              "flex flex-col items-start gap-2 rounded-xl px-4 py-3 text-left ring-1 transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "bg-muted ring-foreground/30"
                : "ring-foreground/10 hover:bg-muted/50 hover:ring-foreground/20"
            )}
          >
            <span className="flex w-full items-center justify-between">
              <Icon className="size-4.5" />
              <span
                aria-hidden
                className={cn(
                  "size-3.5 rounded-full ring-1 ring-foreground/25",
                  selected && "bg-primary ring-primary"
                )}
              />
            </span>
            <span className="font-medium">{label}</span>
            <span className="text-xs text-muted-foreground">{hint}</span>
          </button>
        )
      })}
    </div>
  )
}
