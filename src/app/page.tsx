import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-8 sm:p-24 bg-background">
      <div className="z-10 w-full max-w-5xl flex flex-col items-center justify-center font-sans text-center space-y-8">
        <h1 className="text-5xl font-extrabold tracking-tight sm:text-7xl">
          Client Kit Studio
        </h1>
        <p className="text-xl text-muted-foreground max-w-[600px]">
          The all-in-one document generator and CRM for modern freelancers and agencies.
        </p>
        <div className="flex gap-4 items-center">
          <Link href="/login" className={buttonVariants({ size: "lg", className: "rounded-full" })}>
            Sign In
          </Link>
          <Link href="/dashboard" className={buttonVariants({ variant: "outline", size: "lg", className: "rounded-full" })}>
            Go to Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
