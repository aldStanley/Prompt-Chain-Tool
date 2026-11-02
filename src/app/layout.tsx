import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Prompt Studio · Caption Lab",
  description: "Build, test and refine image-to-caption prompt chains.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
