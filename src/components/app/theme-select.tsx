"use client"

import { useSyncExternalStore } from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { THEME_PREFERENCES, type ThemePreference } from "@/lib/theme"
import { getPreference, getServerPreference, setPreference, subscribe } from "./theme-store"

const LABELS: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "Match my device",
}

/**
 * Dropdown form of the theme picker, for the consolidated settings page where
 * it sits alongside other single-line fields rather than as its own section.
 *
 * The preference lives in browser storage, not on the user record, so it is
 * read through useSyncExternalStore with an explicit server snapshot - there
 * is no value to render during SSR.
 */
export function ThemeSelect() {
  const preference = useSyncExternalStore(subscribe, getPreference, getServerPreference)

  return (
    <Select
      value={preference}
      onValueChange={(value) => setPreference((value as ThemePreference) ?? "system")}
    >
      <SelectTrigger className="max-w-xs" aria-label="Colour theme">
        <SelectValue>{(value: string) => LABELS[(value as ThemePreference) ?? "system"]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {THEME_PREFERENCES.map((value) => (
          <SelectItem key={value} value={value}>
            {LABELS[value]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
