import type { Metadata } from "next";
import { Press_Start_2P, Josefin_Sans } from "next/font/google";
import "./globals.css";

const pressStart = Press_Start_2P({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-arcade",
  display: "swap",
});

const josefin = Josefin_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Muragoods | Fresh Musubi, Churros, Coffee Jelly & Cookies",
  description:
    "Muragoods — Campus power-up food stall. Order legendary musubi, churros, coffee jelly & cookies delivered to your door.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${pressStart.variable} ${josefin.variable}`} style={{ fontFamily: "var(--font-body)" }}>
        {children}
      </body>
    </html>
  );
}
