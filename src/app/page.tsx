import Home from "./page.client";
import { buildMetadataForDate, normalizeDateParam } from "./metadata";

export async function generateMetadata({
  searchParams,
}: {
  searchParams?:
    | Record<string, string | string[] | undefined>
    | Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const date = normalizeDateParam(resolvedSearchParams?.date);
  return buildMetadataForDate(date);
}

export const dynamic = "force-dynamic";

export default function Page() {
  return <Home />;
}
