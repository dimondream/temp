import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Transcription App - Real-time Audio to Text",
  description:
    "A web-based transcription tool that captures audio from your browser and provides real-time transcription with support for multiple languages.",
  keywords:
    "transcription, audio-to-text, real-time, AWS Transcribe, speech recognition",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
