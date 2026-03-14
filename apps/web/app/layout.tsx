import type { Metadata } from "next";
import { getDictionary } from "@/lib/i18n/messages";
import { getServerLocale } from "@/lib/i18n/server";
import "./globals.css";

export function generateMetadata(): Metadata {
  const locale = getServerLocale();
  const copy = getDictionary(locale);

  return {
    title: copy.app.title,
    description: copy.app.description
  };
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = getServerLocale();
  const copy = getDictionary(locale);

  return (
    <html lang={copy.app.lang}>
      <body>{children}</body>
    </html>
  );
}
