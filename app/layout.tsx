import type { Metadata } from "next";
import { Raleway } from "next/font/google";
import "./globals.css";

const raleway = Raleway({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-raleway",
});

export const metadata: Metadata = {
  title: "Muragoods | Fresh Musubi, Churros, Coffee Jelly & Cookies",
  description:
    "Muragoods local food storefront with DWCL delivery policy, Saturday delivery, and customer order tracking.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${raleway.variable} font-sans`}>{children}</body>
    </html>
  );
}
