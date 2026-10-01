import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pet Food Recall Checker — Is Your Dog Food Recalled?",
  description:
    "Enter the brand and lot number from the bag to check it against pet food recalls. Free, instant.",
  robots: { index: true, follow: true },
};

export default function PetLayout({ children }: { children: React.ReactNode }) {
  return children;
}
