import { Bricolage_Grotesque, Inter } from "next/font/google";

// Shared by the root layout and global-error.tsx, which replaces that layout
// when it fails and would otherwise lose the fonts.
export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// One static weight keeps the display font small; headlines never need another.
export const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: "600",
  variable: "--font-bricolage",
  display: "swap",
});
