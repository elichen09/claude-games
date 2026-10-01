import type { Metadata, Viewport } from "next";
import { site } from "@/site.config";
import { WorldProvider } from "@/components/WorldProvider";
import { SiteNav } from "@/components/SiteNav";
import { WORLD_STORAGE_KEY } from "@/lib/worlds/meta";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: site.name, template: `%s · ${site.name}` },
  description: site.description,
  openGraph: { siteName: site.name, type: "website" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0b1a2c" };

// Applies the saved world before first paint, so the page doesn't flash the default colors.
const worldScript = `try{var w=JSON.parse(localStorage.getItem(${JSON.stringify(WORLD_STORAGE_KEY)}));if(["abyss","core","collage","orbit"].indexOf(w)>-1)document.documentElement.dataset.world=w}catch(e){}`;

const FONTS =
  "https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600;700&family=Silkscreen&family=VT323&family=Press+Start+2P&family=Sixtyfour&family=Bagel+Fat+One&family=Courier+Prime:wght@400;700&display=swap";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-world="abyss" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: worldScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>
        <WorldProvider>
          <div className="wrap">
            <SiteNav />
            {children}
          </div>
        </WorldProvider>
      </body>
    </html>
  );
}
