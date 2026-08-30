"use client"

import ClientForm from "../../client-form"
import { updateClient, type ClientFormInput } from "../../actions"

export default function EditClientForm({
  clientId,
  codeLocked,
  businessCurrency,
  initial,
}: {
  clientId: string
  codeLocked?: boolean
  businessCurrency?: string
  initial: ClientFormInput
}) {
  return (
    <ClientForm
      initial={initial}
      codeLocked={codeLocked}
      businessCurrency={businessCurrency}
      submitLabel="Save Changes"
      onSubmit={(input) => updateClient(clientId, input)}
    />
  )
}
