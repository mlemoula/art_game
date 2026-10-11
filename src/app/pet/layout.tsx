import type { Metadata } from "next";

// This page is an unfinished prototype with no recall data: keep it out of search results.
export const metadata: Metadata = {
  title: "RecallCheck — not live yet",
  description:
    "Early prototype. This page cannot check pet food recalls yet. See the official FDA recalls list instead.",
  robots: { index: false, follow: false },
};

export default function PetLayout({ children }: { children: React.ReactNode }) {
  return children;
}
