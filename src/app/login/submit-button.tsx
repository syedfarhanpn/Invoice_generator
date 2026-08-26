"use client"

import { useFormStatus } from "react-dom"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

/**
 * Split out of the login page purely so useFormStatus has a child of <form>
 * to read from - the page itself stays a Server Component.
 *
 * `login` redirects on both success and failure, so pending stays true from
 * the click until the next route paints; there is no state to reset here.
 */
export function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
      {pending ? (
        <>
          <Spinner label="Signing in" className="mr-2" />
          Signing in...
        </>
      ) : (
        "Sign In"
      )}
    </Button>
  )
}
