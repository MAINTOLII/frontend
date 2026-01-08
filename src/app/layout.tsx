import "./globals.css";

import type { Metadata } from "next";
import { CartProvider } from "@/context/CartContext";
import { OrderModeProvider } from "@/context/OrderModeContext";
import { LanguageProvider } from "@/context/LanguageContext";
import AppShell from "@/components/AppShell";
import BottomNav from "@/components/BottomNav";

export const metadata: Metadata = {
  metadataBase: new URL("https://matomart.so"),
  title: {
    default: "MatoMart – Raashin Soomaaliya | Minimart Online",
    template: "%s | MatoMart",
  },
  description:
    "MatoMart waa minimart online ah oo bixisa raashin, cabitaanno, alaabo guriga & ilmaha. Keenid degdeg ah gudaha Soomaaliya.",
  alternates: { canonical: "https://matomart.so" },
  openGraph: {
    siteName: "MatoMart",
    type: "website",
    locale: "so_SO",
    url: "https://matomart.so",
    images: ["https://matomart.so/og-default.jpg"],
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="so" data-default-lang="so">
      <body>
        <LanguageProvider>
          <OrderModeProvider>
            <CartProvider>
              <div className="min-h-screen pb-28">
                <AppShell>{children}</AppShell>
              </div>
              <BottomNav />
            </CartProvider>
          </OrderModeProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}