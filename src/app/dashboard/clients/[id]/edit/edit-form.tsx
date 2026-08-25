"use client"

import ClientForm from "../../client-form"
import { updateClient, type ClientFormInput } from "../../actions"

export default function EditClientForm({
  clientId,
  codeLocked,
  initial,
}: {
  clientId: string
  codeLocked: boolean
  initial: ClientFormInput
}) {
  return (
    <ClientForm
      initial={initial}
      codeLocked={codeLocked}
      submitLabel="Save Changes"
      onSubmit={(input) => updateClient(clientId, input)}
    />
  )
}
