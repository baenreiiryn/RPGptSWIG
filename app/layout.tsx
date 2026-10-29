import type { Metadata } from "next";
import "./globals.css";
import "./equipment.css";
import "./beastforms.css";

export const metadata: Metadata = {
  title: "OracleRPG",
  description: "Uma interface persistente para campanhas narradas por IA.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
