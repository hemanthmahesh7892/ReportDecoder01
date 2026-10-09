import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Report Decoder — Your medical report, decoded in your language",
  description:
    "Upload your medical report or prescription and get a simple, patient-friendly explanation in your chosen language. Powered by AI.",
  keywords: [
    "medical report",
    "prescription decoder",
    "health",
    "AI",
    "multilingual",
    "lab report",
    "patient-friendly",
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col relative overflow-x-hidden text-base">
        {/* Skip-to-content link for keyboard / screen-reader users */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
