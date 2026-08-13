import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Muragoods | Fresh Musubi, Churros, Coffee Jelly & Cookies",
  description:
    "Muragoods local food storefront with DWCL delivery policy, Saturday delivery, and customer order tracking.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
