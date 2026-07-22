import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { TimezoneCookie } from "@/components/timezone-cookie";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:3000")
  ),
  title: "EVGV Picks",
  description: "Draft teams. Compete with friends. Dominate.",
  openGraph: {
    title: "EVGV Picks",
    description: "Draft teams. Compete with friends. Dominate.",
    siteName: "EVGV Picks",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TimezoneCookie />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
