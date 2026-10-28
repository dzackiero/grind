import type { Metadata, Viewport } from "next";
import { Archivo, Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { PwaRegister } from "@/components/kilo/pwa-register";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"] });

export const metadata: Metadata = {
  title: "Kilo",
  description: "One plan for running and strength.",
  applicationName: "Kilo",
  // iOS home-screen app: opens full screen with a black status bar above the page (no safe-area handling needed)
  appleWebApp: { capable: true, title: "Kilo", statusBarStyle: "black" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0d0f0c" },
    { media: "(prefers-color-scheme: light)", color: "#f3f4ef" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} ${archivo.variable} font-sans`}>
        {/* Dark first; users can switch to light or follow the system */}
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          {children}
          <Toaster position="top-center" />
          <PwaRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
