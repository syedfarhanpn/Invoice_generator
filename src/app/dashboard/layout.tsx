import { Button } from "@/components/ui/button";
import { Suspense } from "react";
import { DashboardNav } from "@/components/app/dashboard-nav";
import DashboardNavWithRole from "@/components/app/dashboard-nav-role";
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
        {/* Fallback is the same nav minus the operator-only link, so the bar
            is instantly present and usable while the role resolves. */}
        <Suspense fallback={<DashboardNav />}>
          <DashboardNavWithRole />
        </Suspense>
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
