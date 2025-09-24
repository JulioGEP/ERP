const BASE = "https://api.pipedrive.com/v1";
const TOKEN = process.env.PIPEDRIVE_API_TOKEN!;

export async function listDealsUpdatedDesc(limit = 100) {
  const url = `${BASE}/deals?api_token=${TOKEN}&limit=${limit}&sort=update_time%20DESC`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pipedrive error: ${res.status}`);
  const json = await res.json();
  return json.data ?? [];
}

type DealResponse = {
  data?: unknown;
};

export async function getDealById(dealId: number) {
  const url = new URL(`${BASE}/deals/${dealId}`);
  url.searchParams.set("api_token", TOKEN);
  url.searchParams.set("include_products", "1");
  url.searchParams.set("include_notes", "1");
  url.searchParams.set("include_files", "1");
  url.searchParams.set("include_related_objects", "1");

  const res = await fetch(url);

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error(`Pipedrive error: ${res.status}`);
  }

  const json = (await res.json()) as DealResponse;
  return json.data ?? null;
}
