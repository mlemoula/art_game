import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/context/theme";
import { generateMetadata } from "./metadata";
import Head from "./head"; // ton composant serveur Head

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

interface RootLayoutProps {
  children: React.ReactNode;
  searchParams?: Record<string, string | string[] | undefined>;
}

export default async function RootLayout({
  children,
  searchParams = {},
}: Readonly<RootLayoutProps>) {
  // Génère dynamiquement le metadata côté serveur
  const metadata = await generateMetadata({ searchParams });

  return (
    <html lang="en">
      {/* Head serveur pour OG/Twitter dynamiques */}
      <Head metadata={metadata} />

      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
