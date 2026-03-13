import Home from "./page.client";
import { APP_BASE_URL, buildPuzzleMetadataForDate, normalizeDateParam } from "./metadata";
import { redirect } from "next/navigation";
import { resolvePlayableDate } from "@/lib/dateUtils";

const HOME_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Quiz",
  name: "Who Painted This?",
  description: "A daily art quiz. One painting, 5 tries, guess the painter.",
  url: APP_BASE_URL,
  inLanguage: "en",
  educationalUse: "practice",
  about: {
    "@type": "Thing",
    name: "Art history and painting",
  },
  publisher: {
    "@type": "Organization",
    name: "Who Painted This?",
    url: APP_BASE_URL,
  },
};

export async function generateMetadata() {
  return buildPuzzleMetadataForDate();
}

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const date = normalizeDateParam(resolvedSearchParams?.date);
  if (date) {
    const playableDate = resolvePlayableDate(date);
    if (playableDate) {
      redirect(`/puzzle/${encodeURIComponent(playableDate)}`);
    }
    redirect("/");
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(HOME_SCHEMA) }}
      />
      <Home />
    </>
  );
}
