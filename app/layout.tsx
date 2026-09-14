import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ByteLab — Preparação de Catálogos",
  description:
    "Prepare, valide e revise catálogos de vestuário para diferentes marketplaces.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
