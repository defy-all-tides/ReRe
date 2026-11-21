import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Relationship Reminder | 시각적 사고의 연결",
  description: "사람과 생각을 연결하는 지능형 마인드맵 도구",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${inter.variable} ${outfit.variable} h-full antialiased transition-all duration-300`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                if (typeof window !== 'undefined') {
                  const origError = console.error;
                  console.error = function(...args) {
                    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
                    if (msg.includes('bis_skin_checked') || (msg.includes('hydration-mismatch') && msg.includes('bis_skin_checked'))) {
                      return;
                    }
                    origError.apply(console, args);
                  };
                }
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col font-inter" suppressHydrationWarning>{children}</body>
    </html>
  );
}
