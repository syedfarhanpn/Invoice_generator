"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ImageUp, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import {
  LOGO_ALLOWED_TYPES,
  LOGO_BUCKET,
  LOGO_MAX_BYTES,
  logoObjectPath,
  validateLogo,
} from "@/lib/logo-upload"
import { createClient } from "@/utils/supabase/client"
import { removeBusinessLogo, setBusinessLogo } from "./logo-actions"

export function LogoUploader({ currentLogoUrl }: { currentLogoUrl: string | null }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Shows the chosen image immediately, before the upload finishes.
  const [preview, setPreview] = useState<string | null>(null)

  const shown = preview ?? currentLogoUrl

  async function handleFile(file: File) {
    const problem = validateLogo(file)
    if (problem) {
      setError(problem)
      return
    }

    setError(null)
    setBusy(true)
    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)

    try {
      const supabase = createClient()
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) throw new Error("Your session has expired. Sign in again.")

      const path = logoObjectPath(auth.user.id, file.type)
      if (!path) throw new Error("Use a PNG, JPG or WebP image.")

      // Straight to storage. RLS only permits writes under this user's own
      // folder, which is the first segment of `path`.
      const { error: uploadError } = await supabase.storage
        .from(LOGO_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false })
      if (uploadError) throw new Error(uploadError.message)

      const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path)
      await setBusinessLogo(data.publicUrl)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that image.")
      setPreview(null)
    } finally {
      URL.revokeObjectURL(objectUrl)
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function handleRemove() {
    setBusy(true)
    setError(null)
    try {
      await removeBusinessLogo()
      setPreview(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the logo.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <Label>Logo</Label>

      <div className="flex items-center gap-4">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="Business logo" className="size-full object-contain p-1" />
          ) : (
            <ImageUp className="size-6 text-muted-foreground" aria-hidden="true" />
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? (
                <>
                  <Spinner label="Uploading" className="mr-2" /> Uploading...
                </>
              ) : (
                <>
                  <ImageUp className="mr-2 size-4" /> {shown ? "Replace logo" : "Upload logo"}
                </>
              )}
            </Button>

            {shown && !busy && (
              <Button type="button" variant="ghost" size="sm" onClick={handleRemove}>
                <Trash2 className="mr-2 size-4" /> Remove
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            PNG, JPG or WebP, up to {Math.floor(LOGO_MAX_BYTES / 1024 / 1024)} MB. Printed on
            every invoice, quotation and contract.
          </p>
        </div>
      </div>

      {/* Kept out of the settings <form> flow: the upload is its own action and
          saves on its own, so it must not be submitted with the profile. */}
      <input
        ref={inputRef}
        type="file"
        accept={LOGO_ALLOWED_TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
        }}
      />

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
