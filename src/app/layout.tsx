import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { NavigationProgress } from "@/components/app/navigation-progress";
import { ThemeScript } from "@/components/app/theme-script";
import { SpeedInsights } from "@vercel/speed-insights/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Pages show their own name alone. `default` still covers routes that set
  // no title of their own (the landing page).
  title: {
    default: "Client Kit Studio",
    template: "%s",
  },
  description: "Client document generator and CRM SaaS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The font variables live on <html>, not <body>: globals.css applies
    // `font-sans` to <html>, and a variable defined on the child cannot be
    // read by its parent. Declared here they are in scope for both.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full flex flex-col antialiased bg-background text-foreground">
        <NavigationProgress />
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
