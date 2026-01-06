import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/context/theme";
import type { Metadata } from "next";
import { generateMetadata, metadata as defaultMetadata } from "./metadata";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const resolveString = (value?: string | URL | { toString: () => string }) => {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  return value.toString();
};

const pickImageUrl = (
  input?: Metadata["openGraph"]["images"]
): string | undefined => {
  if (!input) return undefined;
  if (typeof input === "string") return resolveString(input);
  if (Array.isArray(input) && input.length) {
    const first = input[0];
    if (typeof first === "string") return resolveString(first);
    if (first?.url) return resolveString(first.url);
  }
  if (typeof input === "object" && "url" in input && input.url) {
    return resolveString(input.url);
  }
  return undefined;
};

export default async function RootLayout({
  children,
  searchParams,
}: Readonly<{
  children: React.ReactNode;
  searchParams?: Record<string, string | string[] | undefined>;
}>) {
  const resolved = await generateMetadata({
    searchParams: searchParams ?? {},
  });
  const title =
    resolveString(resolved.title) ?? resolveString(defaultMetadata.title);
  const description =
    resolved.description ?? defaultMetadata.description ?? undefined;
  const openGraph = resolved.openGraph;
  const ogUrl =
    resolveString(openGraph?.url) ??
    resolveString(defaultMetadata.openGraph?.url);
  const ogLocale =
    openGraph?.locale ?? defaultMetadata.openGraph?.locale ?? undefined;
  const ogType =
    openGraph?.type ?? defaultMetadata.openGraph?.type ?? undefined;
  const ogSiteName =
    openGraph?.siteName ?? defaultMetadata.openGraph?.siteName ?? undefined;
  const ogImage = pickImageUrl(
    openGraph?.images ?? defaultMetadata.openGraph?.images
  );
  const twitter = resolved.twitter;
  const twitterImage =
    pickImageUrl(twitter?.images ?? defaultMetadata.twitter?.images) ?? ogImage;
  const twitterCard =
    twitter?.card ??
    defaultMetadata.twitter?.card ??
    "summary_large_image";

  return (
    <html lang="en">
      <head>
        {title && <title>{title}</title>}
        {description && <meta name="description" content={description} />}
        {ogLocale && <meta property="og:locale" content={ogLocale} />}
        {ogType && <meta property="og:type" content={ogType} />}
        {ogUrl && <meta property="og:url" content={ogUrl} />}
        {title && <meta property="og:title" content={title} />}
        {description && <meta property="og:description" content={description} />}
        {ogImage && <meta property="og:image" content={ogImage} />}
        {ogSiteName && <meta property="og:site_name" content={ogSiteName} />}
        <meta property="og:logo" content={defaultMetadata.other?.["og:logo"] ?? ""} />
        <meta name="twitter:card" content={twitterCard} />
        {ogUrl && <meta property="twitter:url" content={ogUrl} />}
        {title && <meta name="twitter:title" content={title} />}
        {description && (
          <meta name="twitter:description" content={description} />
        )}
        {twitterImage && <meta name="twitter:image" content={twitterImage} />}
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
