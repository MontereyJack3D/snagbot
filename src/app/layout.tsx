import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SnagBot — restock monitor & auto-buy assist",
  description:
    "Track Amazon, Walmart, and Target products, get instant restock alerts, and auto-navigate to checkout the moment stock drops.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
