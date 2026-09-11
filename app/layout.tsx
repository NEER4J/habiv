import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { themeInitScript } from "@/lib/habiv/theme";
import "./globals.css";

const siteUrl = "https://habiv.vercel.app";
const description =
  "A browser-first marketplace for tiny AI-made games. Discover, play, remix, and share.";
const heroImage = {
  url: "/assets/tiny-game-hero.png",
  width: 1536,
  height: 1024,
  alt: "A tiny astronaut jumping between floating game platforms toward a glowing star",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Habiv — A home for tiny games.",
  description:
    "Habiv is a browser-first marketplace for tiny AI-made games. Discover, play, remix, and share games that last 10–45 seconds.",
  applicationName: "Habiv",
  authors: [{ name: "Habiv" }],
  alternates: { canonical: "/" },
  icons: { icon: "/assets/brand/habiv-black.svg" },
  robots: {
    index: true,
    follow: true,
    googleBot: { "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  openGraph: {
    siteName: "Habiv",
    title: "Habiv — A home for tiny games.",
    description,
    type: "website",
    url: "/",
    locale: "en_US",
    images: [heroImage],
  },
  twitter: {
    card: "summary_large_image",
    title: "Habiv — A home for tiny games.",
    description,
    images: [heroImage],
  },
};

export const viewport: Viewport = { themeColor: "#050505" };

const sans = Space_Grotesk({
  variable: "--font-sans",
  display: "swap",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  display: "swap",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Apply the saved Habiv theme before first paint so reloads don't flash or reset it. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
