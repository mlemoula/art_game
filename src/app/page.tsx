import Home from "./page.client";
import { buildMetadataForDate, normalizeDateParam } from "./metadata";

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const date = normalizeDateParam(searchParams?.date);
  return buildMetadataForDate(date);
}

export default function Page() {
  return <Home />;
}
