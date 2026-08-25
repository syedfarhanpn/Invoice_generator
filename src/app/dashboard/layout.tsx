import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout } from "@/app/login/actions";
import { LogOut } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full flex-col bg-muted/40">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-lg font-semibold md:text-base"
        >
          <span className="font-bold">Client Kit</span>
        </Link>
        <nav className="hidden md:flex md:flex-row md:items-center md:gap-5 md:text-sm lg:gap-6 ml-6">
          <Link
            href="/dashboard"
            className="text-foreground transition-colors hover:text-foreground"
          >
            Dashboard
          </Link>
          <Link
            href="/dashboard/documents"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Documents
          </Link>
          <Link
            href="/dashboard/clients"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Clients
          </Link>
          <Link
            href="/dashboard/settings/business"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Settings
          </Link>
        </nav>
        <div className="flex w-full items-center gap-4 md:ml-auto md:gap-2 lg:gap-4">
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="secondary" size="icon" className="rounded-full">
                    U
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <form action={logout}>
                  <DropdownMenuItem
                    variant="destructive"
                    render={<button type="submit" className="w-full" />}
                  >
                    <LogOut className="w-4 h-4 mr-2" /> Sign out
                  </DropdownMenuItem>
                </form>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        {children}
      </main>
    </div>
  );
}
