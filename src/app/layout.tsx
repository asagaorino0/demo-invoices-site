import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import {
  Hachi_Maru_Pop,
  Hina_Mincho,
  Inter,
  Kaisei_HarunoUmi,
  Klee_One,
  Kosugi_Maru,
  Kiwi_Maru,
  M_PLUS_1p,
  New_Tegomin,
  Noto_Sans_JP,
  Noto_Serif_JP,
  Palette_Mosaic,
  Potta_One,
  Rampart_One,
  Reggae_One,
  RocknRoll_One,
  Sawarabi_Gothic,
  Sawarabi_Mincho,
  Shippori_Mincho,
  Shippori_Mincho_B1,
  Stick,
  Yomogi,
  Yusei_Magic,
  Yuji_Mai,
  Yuji_Syuku,
  Zen_Antique,
} from "next/font/google";

const STAMP_FONT_STYLESHEET_HREF =
  "https://fonts.googleapis.com/css2?family=Hachi+Maru+Pop&family=Hina+Mincho&family=Kaisei+HarunoUmi:wght@400;500;700&family=Klee+One:wght@400;600&family=Kosugi+Maru&family=Kiwi+Maru:wght@300;400;500&family=M+PLUS+1p:wght@300;400;500;700&family=New+Tegomin&family=Noto+Sans+JP:wght@400;500;700&family=Noto+Serif+JP:wght@400;500;700&family=Palette+Mosaic&family=Potta+One&family=Rampart+One&family=Reggae+One&family=RocknRoll+One&family=Sawarabi+Gothic&family=Sawarabi+Mincho&family=Shippori+Mincho:wght@400;600;700&family=Shippori+Mincho+B1&family=Stick&family=Yomogi&family=Yuji+Mai&family=Yuji+Syuku&family=Yusei+Magic&family=Zen+Antique&display=swap";

const inter = Inter({ subsets: ["latin"] });
const notoSansJp = Noto_Sans_JP({ weight: ["400", "500", "700"], variable: "--font-noto-sans-jp", preload: false });
const notoSerifJp = Noto_Serif_JP({ weight: ["400", "500", "700"], variable: "--font-noto-serif-jp", preload: false });
const hinaMincho = Hina_Mincho({ weight: "400", variable: "--font-hina-mincho", preload: false });
const yujiMai = Yuji_Mai({ weight: "400", variable: "--font-yuji-mai", preload: false });
const kleeOne = Klee_One({ weight: ["400", "600"], variable: "--font-klee-one", preload: false });
const kosugiMaru = Kosugi_Maru({ weight: "400", variable: "--font-kosugi-maru", preload: false });
const kiwiMaru = Kiwi_Maru({ weight: ["300", "400", "500"], variable: "--font-kiwi-maru", preload: false });
const kaiseiHarunoUmi = Kaisei_HarunoUmi({ weight: ["400", "500", "700"], variable: "--font-kaisei-harunoumi", preload: false });
const sawarabiMincho = Sawarabi_Mincho({ weight: "400", variable: "--font-sawarabi-mincho", preload: false });
const sawarabiGothic = Sawarabi_Gothic({ weight: "400", variable: "--font-sawarabi-gothic", preload: false });
const newTegomin = New_Tegomin({ weight: "400", variable: "--font-new-tegomin", preload: false });
const mPlus1p = M_PLUS_1p({ weight: ["300", "400", "500", "700"], variable: "--font-m-plus-1p", preload: false });
const paletteMosaic = Palette_Mosaic({ weight: "400", variable: "--font-palette-mosaic", preload: false });
const rampartOne = Rampart_One({ weight: "400", variable: "--font-rampart-one", preload: false });
const stick = Stick({ weight: "400", variable: "--font-stick", preload: false });
const rocknRollOne = RocknRoll_One({ weight: "400", variable: "--font-rocknroll-one", preload: false });
const reggaeOne = Reggae_One({ weight: "400", variable: "--font-reggae-one", preload: false });
const pottaOne = Potta_One({ weight: "400", variable: "--font-potta-one", preload: false });
const yomogi = Yomogi({ weight: "400", variable: "--font-yomogi", preload: false });
const hachiMaruPop = Hachi_Maru_Pop({ weight: "400", variable: "--font-hachi-maru-pop", preload: false });
const yuseiMagic = Yusei_Magic({ weight: "400", variable: "--font-yusei-magic", preload: false });
const yujiSyuku = Yuji_Syuku({ weight: "400", variable: "--font-yuji-syuku", preload: false });
const zenAntique = Zen_Antique({ weight: "400", variable: "--font-zen-antique", preload: false });
const shipporiMincho = Shippori_Mincho({
  weight: ["400", "600", "700"],
  variable: "--font-shippori-mincho",
  preload: false,
});
const shipporiMinchoB1 = Shippori_Mincho_B1({
  weight: "400",
  variable: "--font-shippori-mincho-b1",
  preload: false,
});
export const metadata: Metadata = {
  title: 'demo-invoices workbench',
  description: 'Static invoice demo and editing workbench scaffold.'
};


const bodyClassName = [
  inter.className,
  notoSansJp.variable,
  notoSerifJp.variable,
  hinaMincho.variable,
  yujiMai.variable,
  kleeOne.variable,
  kosugiMaru.variable,
  kiwiMaru.variable,
  kaiseiHarunoUmi.variable,
  sawarabiMincho.variable,
  sawarabiGothic.variable,
  newTegomin.variable,
  mPlus1p.variable,
  paletteMosaic.variable,
  rampartOne.variable,
  stick.variable,
  rocknRollOne.variable,
  reggaeOne.variable,
  pottaOne.variable,
  yomogi.variable,
  hachiMaruPop.variable,
  yuseiMagic.variable,
  yujiSyuku.variable,
  zenAntique.variable,
  shipporiMincho.variable,
  shipporiMinchoB1.variable,
].join(" ");

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
      <body className={bodyClassName}>{children}</body>
    </html>
  );
}
