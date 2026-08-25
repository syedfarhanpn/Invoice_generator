"use client"

import ClientForm from "../client-form"
import { createClient } from "../actions"

export default function NewClientPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Add Client</h2>
        <p className="text-muted-foreground">Their serial code is used in every invoice/contract number.</p>
      </div>
      <ClientForm onSubmit={createClient} submitLabel="Add Client" />
    </div>
  )
}
