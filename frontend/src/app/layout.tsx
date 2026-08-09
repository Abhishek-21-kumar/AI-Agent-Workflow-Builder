import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { NhostProviderWrapper } from "@/components/providers/NhostProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Agent Workflow Builder | Nhost & Hasura Multi-Tenant Engine",
  description: "Production-grade multi-tenant AI agent workflow builder with live GraphQL subscriptions and step-level authorization.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NhostProviderWrapper>{children}</NhostProviderWrapper>
      </body>
    </html>
  );
}

