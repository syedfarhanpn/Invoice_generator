import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { login } from "./actions";
import { SubmitButton } from "./submit-button";

// Single-admin app: no signup form here, and none should be added. See
// src/app/login/actions.ts and src/lib/current-user.ts for the enforcement.
export default async function LoginPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const searchParams = await props.searchParams;
  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Admin sign in</CardTitle>
          <CardDescription>
            This is a private workspace. Sign in with the admin account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={login} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="you@example.com" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required />
            </div>
            {searchParams?.error && (
              <p className="text-sm text-destructive">{searchParams.error}</p>
            )}
            <div className="flex flex-col gap-2 pt-2">
              <SubmitButton />
            </div>
          </form>
        </CardContent>
        <CardFooter>
          <p className="text-xs text-muted-foreground">
            No public signup. Access is restricted to a single admin account.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
