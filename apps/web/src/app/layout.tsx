import { themeScript } from '@dashdb/ui/server';
import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { getSiteUrl } from '@/lib/config';
import { SITE } from '@/lib/site';
import './globals.css';

// next/font downloads these at build time and serves them from our own origin, with size-adjusted
// fallbacks so swapping in the web font doesn't shift the layout.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
  // Not preloaded: it only sets code snippets, and a preload competes with the marketing pages'
  // largest image on slow connections. Pages fetch it as soon as their CSS uses it.
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: { default: SITE.name, template: `%s · ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
};

// Providers for tooltips and toasts live in the /app and /design layouts, not here, so the
// marketing pages stay free of the component library's client JavaScript.
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // The theme script sets class/style on <html> before hydration.
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
