// page.tsx here is a Client Component, and metadata can only be exported from
// a Server Component - so the title lives in this layout instead.
export const metadata = { title: "Add client" }

export default function NewClientLayout({ children }: { children: React.ReactNode }) {
  return children
}
