import type { Metadata } from "next";
import "./globals.css";
import "./themes.css";

export const metadata: Metadata = {
  title: "SellerScope Analytics",
  description: "Управленческая аналитика Wildberries и Ozon",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
