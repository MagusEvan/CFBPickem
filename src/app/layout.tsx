import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import { NavProgress } from "@/components/nav-progress";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CFB Pickem",
  description: "College Football Draft Pickem Game",
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
    >
      <body className="min-h-full flex flex-col font-sans">
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
