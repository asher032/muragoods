import type { Metadata, Viewport } from "next";
import { Press_Start_2P, Josefin_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { NotificationSetup } from "@/app/components/NotificationSetup";

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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#4A90D9",
};

export const metadata: Metadata = {
  title: "Muragoods | Fresh Musubi, Churros, Coffee Jelly & Cookies",
  description: "Muragoods — Campus power-up food stall. Order legendary musubi, churros, coffee jelly & cookies delivered to your door.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Muragoods",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${pressStart.variable} ${josefin.variable}`} style={{ fontFamily: "var(--font-body)" }}>
        {children}
        <NotificationSetup />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
