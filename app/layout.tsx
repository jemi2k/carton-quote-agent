import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Carton Quotation Agent",
  description: "From an inquiry email to an approvable quote — in seconds.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-paper min-h-screen">{children}</body>
    </html>
  );
}
