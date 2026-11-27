import type { Metadata, Viewport } from "next";

import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, X_HANDLE } from "@/lib/site";

import { bricolage, inter } from "./fonts";
import "./globals.css";

const TITLE = "Pitchype: hire creators, get paid for your work";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
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
    site: X_HANDLE,
    title: TITLE,
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#f8f8f6",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-scroll-behavior: globals.css scrolls smoothly (for anchor links);
    // this tells Next to turn it off while switching pages.
    <html
      lang="en"
      className={`${inter.variable} ${bricolage.variable}`}
      data-scroll-behavior="smooth"
    >
      {/* Each route group ((marketing), (auth), (app)) brings its own chrome. */}
      <body>{children}</body>
    </html>
  );
}
