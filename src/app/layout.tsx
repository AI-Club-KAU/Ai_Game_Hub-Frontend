import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "بوابة البوث | AI Club Games Hub", description: "منصة ألعاب نادي الذكاء الاصطناعي لفعالية Dev Week" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl"><body>{children}</body></html>;
}