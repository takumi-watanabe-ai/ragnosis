import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RAGnosis - Curated RAG Intelligence",
  description:
    "A curated intelligence platform for RAG technology. Get quantitative metrics from HuggingFace and GitHub, plus expert knowledge from 4,000+ blog articles.",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Syne:wght@400..800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
