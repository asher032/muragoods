import type { Metadata, Viewport } from "next";
import { Press_Start_2P, Josefin_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { NotificationSetup } from "@/app/components/NotificationSetup";
import { AppLoader } from "@/app/components/AppLoader";
import { PWAInstallBanner } from "@/app/components/PWAInstallBanner";
import { NotificationProvider } from "@/app/components/NotificationSystem";
import { OrderNotificationPoller } from "@/app/components/OrderNotifications";
import { BottomNavBar } from "@/app/components/BottomNavBar";
import { CookieNotice } from "@/app/components/CookieNotice";
import { JarvisProvider } from "@/app/components/JARVISProvider";

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
  themeColor: "#0f0f1a",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  title: {
    default: "Muragoods — Campus Power-Up Food",
    template: "%s | Muragoods",
  },
  description: "Order fresh musubi, churros, coffee jelly & cookies. Play games, earn coins, and share untold words.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Muragoods",
  },
  openGraph: {
    title: "Muragoods — Campus Power-Up Food",
    description: "Order fresh musubi, churros, coffee jelly & cookies. Play games, earn coins, and share untold words.",
    siteName: "Muragoods",
    images: [
      {
        url: "https://muragoods.vercel.app/api/og",
        width: 1200,
        height: 630,
        alt: "Muragoods",
      },
    ],
    type: "website",
    url: "https://muragoods.vercel.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "Muragoods — Campus Power-Up Food",
    description: "Order fresh musubi, churros, coffee jelly & cookies. Play games, earn coins, and share untold words.",
    images: ["https://muragoods.vercel.app/api/og"],
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${pressStart.variable} ${josefin.variable}`} style={{ fontFamily: "var(--font-body)" }}>
        <NotificationProvider>
          <JarvisProvider>
            <AppLoader>
              {children}
              <BottomNavBar />
              <CookieNotice />
            </AppLoader>
          <OrderNotificationPoller />
          <PWAInstallBanner />
          <NotificationSetup />
          </JarvisProvider>
        </NotificationProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
