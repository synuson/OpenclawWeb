import type { Metadata } from "next";
import { getDictionary } from "@/lib/i18n/messages";
import "./globals.css";

const copy = getDictionary();

export const metadata: Metadata = {
  title: copy.app.title,
  description: copy.app.description
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={copy.app.lang}>
      <body>{children}</body>
    </html>
  );
}