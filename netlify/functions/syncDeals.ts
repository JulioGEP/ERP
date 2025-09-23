import { Handler } from "@netlify/functions";
import { db } from "../../shared/db";
import { deals } from "../../db/schema";
import { listDealsUpdatedDesc } from "../../adapters/pipedrive";

export const handler: Handler = async () => {
  try {
    const items = await listDealsUpdatedDesc(50);
    // TODO: map and upsert by pipedriveId (demo: insert titles only if not exists)
    for (const it of items ?? []) {
      const title = it?.title ?? "Deal Pipedrive";
      await db.insert(deals).values({ title, source: "pipedrive", pipedriveId: String(it.id) }).onConflictDoNothing();
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, count: items?.length ?? 0 }) };
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
};
