"use client";

import { MantineProvider } from "@mantine/core";
import type { ReactNode } from "react";

interface ProvidersProps {
  children: ReactNode;
}

/**
 * Wraps the app in shared client-side providers.
 */
export default function Providers({ children }: ProvidersProps): ReactNode {
  return <MantineProvider defaultColorScheme="auto">{children}</MantineProvider>;
}
