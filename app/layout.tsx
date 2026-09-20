import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AccAbad Admin",
  description:
    "AccAbad Admin console for Kripicard account connections, direct card funding, clients, requests, inbox routing, and Telegram support.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
