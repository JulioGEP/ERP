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
  additional_data?: unknown;
  related_objects?: unknown;
};

type DealFilesResponse = {
  data?: unknown;
  additional_data?: unknown;
};

type DealFieldResponse = {
  data?: unknown;
  additional_data?: {
    pagination?: {
      more_items_in_collection?: boolean;
      start?: number;
      limit?: number;
      next_start?: number;
    };
  };
};

type PipelineResponse = {
  data?: unknown;
  additional_data?: {
    pagination?: {
      more_items_in_collection?: boolean;
      start?: number;
      limit?: number;
      next_start?: number;
    };
  };
};

export async function listDealFields() {
  const accumulated: Record<string, unknown>[] = [];

  let hasMore = true;
  let start = 0;

  while (hasMore) {
    const url = new URL(`${BASE}/dealFields`);
    url.searchParams.set("api_token", TOKEN);
    url.searchParams.set("start", String(start));

    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`Pipedrive error: ${res.status}`);
    }

    const payload = (await res.json()) as DealFieldResponse;

    const pageData = Array.isArray(payload.data) ? payload.data : [];

    pageData.forEach((field) => {
      if (field && typeof field === "object" && !Array.isArray(field)) {
        accumulated.push(field as Record<string, unknown>);
      }
    });

    const pagination = payload.additional_data?.pagination;

    if (pagination?.more_items_in_collection) {
      if (typeof pagination.next_start === "number") {
        start = pagination.next_start;
      } else if (typeof pagination.limit === "number") {
        start += pagination.limit;
      } else {
        if (pageData.length === 0) {
          hasMore = false;
        } else {
          start += pageData.length;
        }
      }
    } else {
      hasMore = false;
    }
  }

  return accumulated;
}

export async function listPipelines() {
  const accumulated: Record<string, unknown>[] = [];

  let hasMore = true;
  let start = 0;

  while (hasMore) {
    const url = new URL(`${BASE}/pipelines`);
    url.searchParams.set("api_token", TOKEN);
    url.searchParams.set("start", String(start));

    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`Pipedrive error: ${res.status}`);
    }

    const payload = (await res.json()) as PipelineResponse;
    const pageData = Array.isArray(payload.data) ? payload.data : [];

    pageData.forEach((pipeline) => {
      if (pipeline && typeof pipeline === "object" && !Array.isArray(pipeline)) {
        accumulated.push(pipeline as Record<string, unknown>);
      }
    });

    const pagination = payload.additional_data?.pagination;

    if (pagination?.more_items_in_collection) {
      if (typeof pagination.next_start === "number") {
        start = pagination.next_start;
      } else if (typeof pagination.limit === "number") {
        start += pagination.limit;
      } else {
        if (pageData.length === 0) {
          hasMore = false;
        } else {
          start += pageData.length;
        }
      }
    } else {
      hasMore = false;
    }
  }

  return accumulated;
}

const PRODUCT_KEYS = [
  "products",
  "product_items",
  "productItems",
  "deal_products",
  "dealProducts",
  "items"
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const mergeIntoRecordField = (
  target: Record<string, unknown>,
  key: string,
  source: unknown
) => {
  if (!isRecord(source)) {
    return;
  }

  const existing = target[key];

  if (isRecord(existing)) {
    target[key] = { ...existing, ...source };
  } else {
    target[key] = { ...source };
  }
};

const appendDealProducts = (
  target: Record<string, unknown>,
  payload: DealResponse
) => {
  if (payload.data !== undefined) {
    const data = payload.data;

    PRODUCT_KEYS.forEach((key) => {
      const current = target[key];
      if (
        current === undefined ||
        (Array.isArray(current) && current.length === 0)
      ) {
        target[key] = data;
      }
    });
  }

  mergeIntoRecordField(target, "additional_data", payload.additional_data);
  mergeIntoRecordField(target, "related_objects", payload.related_objects);
};

const appendDealFiles = (
  target: Record<string, unknown>,
  payload: DealFilesResponse
) => {
  if (payload.data !== undefined) {
    const data = payload.data;

    const setIfEmpty = (key: string) => {
      const current = target[key];
      if (current === undefined || (Array.isArray(current) && current.length === 0)) {
        target[key] = data;
      }
    };

    setIfEmpty("files");
    setIfEmpty("attachments");
    setIfEmpty("deal_files");
    setIfEmpty("dealFiles");
  }

  mergeIntoRecordField(target, "additional_data", payload.additional_data);
};

const fetchDealProducts = async (dealId: number): Promise<DealResponse | null> => {
  const url = new URL(`${BASE}/deals/${dealId}/products`);
  url.searchParams.set("api_token", TOKEN);
  url.searchParams.set("include_product_data", "1");

  const res = await fetch(url);

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error(`Pipedrive error: ${res.status}`);
  }

  return (await res.json()) as DealResponse;
};

const fetchDealFiles = async (
  dealId: number
): Promise<DealFilesResponse | null> => {
  const url = new URL(`${BASE}/files`);
  url.searchParams.set("api_token", TOKEN);
  url.searchParams.set("deal_id", String(dealId));

  const res = await fetch(url);

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error(`Pipedrive error: ${res.status}`);
  }

  return (await res.json()) as DealFilesResponse;
};

export async function getDealById(dealId: number) {
  const url = new URL(`${BASE}/deals/${dealId}`);
  url.searchParams.set("api_token", TOKEN);
  url.searchParams.set("include_products", "1");
  url.searchParams.set("include_product_data", "1");
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

  if (!json.data || typeof json.data !== "object") {
    return json.data ?? null;
  }

  const result: Record<string, unknown> = { ...(json.data as Record<string, unknown>) };

  if (json.additional_data !== undefined) {
    result.additional_data = json.additional_data;
  }

  if (json.related_objects !== undefined) {
    result.related_objects = json.related_objects;
  }

  try {
    const productPayload = await fetchDealProducts(dealId);
    if (productPayload) {
      appendDealProducts(result, productPayload);
    }
  } catch (error) {
    console.error(`No se pudieron obtener los productos del deal ${dealId} desde Pipedrive`, error);
  }

  try {
    const filesPayload = await fetchDealFiles(dealId);
    if (filesPayload) {
      appendDealFiles(result, filesPayload);
    }
  } catch (error) {
    console.error(`No se pudieron obtener los archivos del deal ${dealId} desde Pipedrive`, error);
  }

  return result;
}
