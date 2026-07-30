import type { Metadata } from "next";
import "./genel-stiller.css";

export const metadata: Metadata = {
  title: "Belediye Araç Bilgi Sistemi",
  description: "AKOS, Peslayn ve USYS verilerini ayrı ayrı inceleyen ve plaka temelinde tek tabloda birleştiren araç bilgi sistemi.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="tr"><body>{children}</body></html>;
}
