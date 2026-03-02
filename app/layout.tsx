import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@mantine/core/styles.css";
import "quill/dist/quill.snow.css";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Noteblocks",
  description: "Self-hosted notes app built with Next.js",
};

/**
 * Defines the global HTML shell and provider composition.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
