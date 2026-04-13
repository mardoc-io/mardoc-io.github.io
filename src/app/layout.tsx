import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import { ThemeProvider } from "@/lib/theme-context";
import { AppProvider } from "@/lib/app-context";
import "./globals.css";

// Fraunces is loaded only for the MarDoc wordmark — everything else
// uses the system font stack set in globals.css. Exposed via CSS
// variable so components can opt-in per-element without changing the
// global body font.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  title: "mardoc.app",
  description: "A collaborative markdown editor with GitHub integration",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={fraunces.variable}>
      <body>
        <ThemeProvider>
          <AppProvider>{children}</AppProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
