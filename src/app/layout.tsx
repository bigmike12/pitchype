import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";

import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// One static weight keeps the display font small; headlines never need another.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: "600",
  variable: "--font-bricolage",
  display: "swap",
});

const TITLE = "Pitchype: brands meet creators, everybody gets paid";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "en_NG",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#fff9ee",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${bricolage.variable}`}>
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
