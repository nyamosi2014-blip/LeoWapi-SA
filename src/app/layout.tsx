import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { market } from "@/config/market";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: market.brand, template: `%s · ${market.brand}` },
  description: "Nightlife in Johannesburg and Pretoria: where to go, what it costs and how to get there.",
};

export const viewport: Viewport = { themeColor: "#0b0b14" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang={market.locale}>
      <body>
        <header className="site-header">
          <Link href="/" className="brand">{market.brand}</Link>
          <nav>
            <Link href="/account">Account</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
