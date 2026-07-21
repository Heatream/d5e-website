import type { Metadata } from "next";
import { Anton, Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { SiteHeader } from "./components/SiteHeader";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const description = "A fast, searchable rules reference for the D5e Digimon tabletop system.";

  return {
    metadataBase: new URL(origin),
    title: {
      default: "D5e Reference",
      template: "%s | D5e",
    },
    description,
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "D5e Reference",
      description,
      type: "website",
      images: [{ url: `${origin}/og.png`, width: 1536, height: 804, alt: "D5e Digimon 5e Reference" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "D5e Reference",
      description,
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${anton.variable} antialiased`}
      >
        <SiteHeader />
        {children}
        <footer className="site-footer">
          <span>D5e Reference</span>
          <span>Built for digital adventurers.</span>
        </footer>
      </body>
    </html>
  );
}
