"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"

import prisma from "@/lib/db"
import { getCurrentUser } from "@/lib/current-user"
import { isOwnLogoUrl, LOGO_BUCKET } from "@/lib/logo-upload"
import { createClient } from "@/utils/supabase/server"

/**
 * Records a logo that the browser has already uploaded to storage.
 *
 * The upload itself happens client-side, straight to Supabase: server actions
 * cap request bodies at 1MB by default, and round-tripping a 2MB image through
 * the server buys nothing when RLS already restricts writes to the caller's
 * own folder.
 *
 * That makes `publicUrl` untrusted input, so it is verified to point at this
 * tenant's own object before it is stored - otherwise a crafted value could
 * make every invoice load an image from anywhere.
 */
export async function setBusinessLogo(publicUrl: string) {
  const user = await getCurrentUser()

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error("Your session has expired. Sign in again.")

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) throw new Error("Storage is not configured.")

  if (!isOwnLogoUrl(publicUrl, supabaseUrl, auth.user.id)) {
    throw new Error("That image could not be accepted.")
  }

  const previous = await prisma.businessProfile.findUnique({
    where: { userId: user.id },
    select: { logoUrl: true },
  })

  await prisma.businessProfile.update({
    where: { userId: user.id },
    data: { logoUrl: publicUrl },
  })

  // Best effort tidy-up of the file this one replaced. A failure here must not
  // fail the save - the profile already points at the new logo.
  if (previous?.logoUrl && previous.logoUrl !== publicUrl) {
    const marker = `/${LOGO_BUCKET}/`
    const at = previous.logoUrl.indexOf(marker)
    if (at !== -1) {
      const oldPath = previous.logoUrl.slice(at + marker.length)
      if (oldPath.startsWith(`${auth.user.id}/`)) {
        await supabase.storage.from(LOGO_BUCKET).remove([oldPath]).catch(() => {})
      }
    }
  }

  revalidatePath("/dashboard/settings/business")
}

/** Clears the logo. Leaves the stored object alone; only the reference goes. */
export async function removeBusinessLogo() {
  const user = await getCurrentUser()
  await prisma.businessProfile.update({
    where: { userId: user.id },
    data: { logoUrl: null },
  })
  revalidatePath("/dashboard/settings/business")
}
