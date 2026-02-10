import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";

import { TopNav } from "@/components/top-nav";

import "./globals.css";

const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Morgan Virtual Board Member",
  description: "OpenAI-powered virtual board member and shadow board demo",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${mono.variable} min-h-screen`}> 
        <div className="app-background" aria-hidden="true" />
        <TopNav />
        <main className="relative z-10">{children}</main>
      </body>
    </html>
  );
}
