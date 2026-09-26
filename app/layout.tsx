import type { Metadata } from "next";
import "./globals.css";
import "./platform.css";
import "./voice-workbench.css";
import "./ingestion.css";
import "./workspace-flow.css";

export const metadata: Metadata = {
  title: "Relay | Voice and company workspace",
  description: "A voice-first workspace for accountable relationship work.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
