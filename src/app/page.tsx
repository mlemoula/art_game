import Home from "./page.client";
import { buildPuzzleMetadataForDate, normalizeDateParam } from "./metadata";
import { redirect } from "next/navigation";
import { resolvePlayableDate } from "@/lib/dateUtils";

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

  return <Home />;
}
