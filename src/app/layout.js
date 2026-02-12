// src/app/layout.js
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "TaskWhisker",
  description: "Internal operations dashboard for pet-sitting",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={[
          geistSans.variable,
          geistMono.variable,
          "antialiased",
          "min-h-screen",
          "bg-[var(--background)]",
          "text-[var(--foreground)]",
        ].join(" ")}
      >
        {children}
      </body>
    </html>
  );
}
