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
  const url = `${BASE}/deals/${dealId}?api_token=${TOKEN}`;
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
