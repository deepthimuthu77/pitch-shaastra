import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import "./globals.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: {
    default: "PitchGrill — Make your next pitch your best.",
    template: "%s · PitchGrill",
  },
  description:
    "A demanding investor panel, transparent idea analysis, and a better pitch to take into the room.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
