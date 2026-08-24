import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";

import "./globals.css";


const manrope = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Ghosts in the Grid | NYC Adult Day Care Audit",
  description:
    "An open-data investigation of NYC adult day care provider density, corporate links, and spatial multi-tenancy.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
