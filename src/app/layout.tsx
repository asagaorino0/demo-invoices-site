import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Keep this list aligned with the font choices exposed in issuer-settings-panel.tsx
// and the base font in globals.css.
const STAMP_FONT_FAMILIES = [
  'Hachi+Maru+Pop',
  'Hina+Mincho',
  'Kaisei+HarunoUmi:wght@400;500;700',
  'Klee+One:wght@400;600',
  'Kosugi+Maru',
  'Kiwi+Maru:wght@300;400;500',
  'M+PLUS+1p:wght@300;400;500;700',
  'New+Tegomin',
  'Noto+Sans+JP:wght@400;500;700',
  'Noto+Serif+JP:wght@400;500;700',
  'Palette+Mosaic',
  'Potta+One',
  'Rampart+One',
  'Reggae+One',
  'RocknRoll+One',
  'Sawarabi+Gothic',
  'Sawarabi+Mincho',
  'Shippori+Mincho:wght@400;600;700',
  'Shippori+Mincho+B1',
  'Stick',
  'Yomogi',
  'Yuji+Mai',
  'Yuji+Syuku',
  'Yusei+Magic',
  'Zen+Antique',
] as const;

const STAMP_FONT_STYLESHEET_HREF = `https://fonts.googleapis.com/css2?${STAMP_FONT_FAMILIES.map(
  (family) => `family=${family}`
).join('&')}&display=swap`;
export const metadata: Metadata = {
  title: 'demo-invoices workbench',
  description: 'Static invoice demo and editing workbench scaffold.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <head>
        {/* <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" /> */}
        <link href={STAMP_FONT_STYLESHEET_HREF} rel="stylesheet" />
        {/* <link rel="manifest" href="/manifest.json" />
        <meta name="google-site-verification" content="EpGvBWaYilQZZzm_1xACmtA8Ou8eTFed3ap2gONHeQo" />
        <meta name="theme-color" content="#000000" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="konoyubi" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" /> */}
      </head>
      <body>{children}</body>
    </html>
  );
}
