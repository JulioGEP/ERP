import type { Handler } from "@netlify/functions";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { desc, eq, sql } from "drizzle-orm";
import { pipedriveDeals, sharedState } from "../../db/schema";
import { getDealById, listDealFields, listDealsUpdatedDesc } from "../../adapters/pipedrive";

type DealNote = {
  id: string;
  content: string;
  createdAt: string | null;
  authorName: string | null;
  source: "deal" | "product" | "local";
  productId: number | null;
  dealProductId: number | null;
};

type DealAttachment = {
  id: string;
  name: string;
  url: string;
  downloadUrl: string | null;
  fileType: string | null;
  addedAt: string | null;
  addedBy: string | null;
  source: "deal" | "product" | "local";
  productId: number | null;
  dealProductId: number | null;
};

type DealProduct = {
  dealProductId: number;
  productId: number | null;
  name: string;
  code: string | null;
  quantity: number;
  itemPrice: number | null;
  recommendedHours: number | null;
  recommendedHoursRaw: string | null;
  notes: DealNote[];
  attachments: DealAttachment[];
  isTraining: boolean;
};

type DealRecord = {
  id: number;
  title: string;
  clientId: number | null;
  clientName: string | null;
  sede: string | null;
  address: string | null;
  caes: string | null;
  fundae: string | null;
  hotelPernocta: string | null;
  pipelineId: number | null;
  pipelineName: string | null;
  wonDate: string | null;
  formations: string[];
  trainingProducts: DealProduct[];
  extraProducts: DealProduct[];
  notes: DealNote[];
  attachments: DealAttachment[];
};

type RelatedEntity = {
  id: number | null;
  name: string | null;
  address: string | null;
};

const createDatabaseClient = () => {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.warn("DATABASE_URL no configurada; se utilizará almacenamiento en memoria para los datos compartidos");
    return null;
  }

  try {
    const client = neon(connectionString);
    return drizzle(client);
  } catch (error) {
    console.error("No se pudo inicializar la conexión con la base de datos", error);
    return null;
  }
};

const db = createDatabaseClient();

type SharedStateEntry = {
  value: unknown;
  updatedAt: string;
};

const inMemorySharedState = new Map<string, SharedStateEntry>();

let sharedStateTablePromise: Promise<void> | null = null;

const ensureSharedStateTable = async (): Promise<boolean> => {
  if (!db) {
    return false;
  }

  if (!sharedStateTablePromise) {
    sharedStateTablePromise = db
      .execute(sql`
        create table if not exists shared_state (
          key text primary key,
          value jsonb not null,
          updated_at timestamptz default now() not null
        )
      `)
      .then(() => undefined)
      .catch((error) => {
        console.error("No se pudo inicializar la tabla shared_state", error);
        throw error;
      });
  }

  try {
    await sharedStateTablePromise;
    return true;
  } catch (error) {
    console.error("Fallo al comprobar la tabla shared_state", error);
    return false;
  }
};

const readSharedState = async <T>(key: string, fallback: T): Promise<T> => {
  if (!db) {
    const stored = inMemorySharedState.get(key);
    return stored ? (stored.value as T) : fallback;
  }

  const ensured = await ensureSharedStateTable();
  if (!ensured) {
    const stored = inMemorySharedState.get(key);
    return stored ? (stored.value as T) : fallback;
  }

  try {
    const result = await db
      .select({ value: sharedState.value })
      .from(sharedState)
      .where(eq(sharedState.key, key))
      .limit(1);

    if (result.length === 0) {
      return fallback;
    }

    const [entry] = result;
    if (entry.value === null || entry.value === undefined) {
      return fallback;
    }

    return entry.value as T;
  } catch (error) {
    console.error(`No se pudo leer el estado compartido para ${key}`, error);
    const stored = inMemorySharedState.get(key);
    return stored ? (stored.value as T) : fallback;
  }
};

const writeSharedState = async <T>(key: string, value: T): Promise<void> => {
  const serializedValue = value as unknown;

  if (!db) {
    inMemorySharedState.set(key, { value: serializedValue, updatedAt: new Date().toISOString() });
    return;
  }

  const ensured = await ensureSharedStateTable();
  if (!ensured) {
    inMemorySharedState.set(key, { value: serializedValue, updatedAt: new Date().toISOString() });
    return;
  }

  try {
    const now = new Date();
    await db
      .insert(sharedState)
      .values({ key, value: serializedValue as any, updatedAt: now })
      .onConflictDoUpdate({
        target: sharedState.key,
        set: { value: serializedValue as any, updatedAt: now }
      });
  } catch (error) {
    console.error(`No se pudo guardar el estado compartido para ${key}`, error);
    inMemorySharedState.set(key, { value: serializedValue, updatedAt: new Date().toISOString() });
  }
};

type DealStorageEntry = {
  deal: DealRecord;
  updatedAt: string;
};

const inMemoryDeals = new Map<number, DealStorageEntry>();

let pipedriveDealsTablePromise: Promise<void> | null = null;

const ensurePipedriveDealsTable = async (): Promise<boolean> => {
  if (!db) {
    return false;
  }

  if (!pipedriveDealsTablePromise) {
    pipedriveDealsTablePromise = db
      .execute(sql`
        create table if not exists pipedrive_deals (
          deal_id integer primary key,
          title text not null,
          client_name text,
          pipeline_id integer,
          pipeline_name text,
          won_date text,
          data jsonb not null,
          created_at timestamptz default now() not null,
          updated_at timestamptz default now() not null
        )
      `)
      .then(() => undefined)
      .catch((error) => {
        console.error("No se pudo inicializar la tabla pipedrive_deals", error);
        throw error;
      });
  }

  try {
    await pipedriveDealsTablePromise;
    return true;
  } catch (error) {
    console.error("Fallo al comprobar la tabla pipedrive_deals", error);
    return false;
  }
};

const readDealsFromMemory = (): DealRecord[] => {
  const entries = Array.from(inMemoryDeals.values());
  entries.sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
  return entries.map((entry) => entry.deal);
};

const sanitizeStoredDealRecord = (value: unknown): DealRecord | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Partial<DealRecord>;
  const identifier = typeof record.id === "number" && Number.isFinite(record.id) ? record.id : null;

  if (identifier === null) {
    return null;
  }

  const toStringArray = (input: unknown): string[] => {
    if (!Array.isArray(input)) {
      return [];
    }

    return input.filter((item): item is string => typeof item === "string");
  };

  const toDealProductArray = (input: unknown): DealProduct[] => {
    if (!Array.isArray(input)) {
      return [];
    }

    return input.filter((item): item is DealProduct => {
      if (!item || typeof item !== "object") {
        return false;
      }

      const candidate = item as DealProduct;
      return typeof candidate.dealProductId === "number" && typeof candidate.name === "string";
    });
  };

  const toDealNoteArray = (input: unknown): DealNote[] => {
    if (!Array.isArray(input)) {
      return [];
    }

    return input.filter((item): item is DealNote => {
      if (!item || typeof item !== "object") {
        return false;
      }

      const candidate = item as DealNote;
      return typeof candidate.id === "string" && typeof candidate.content === "string";
    });
  };

  const toDealAttachmentArray = (input: unknown): DealAttachment[] => {
    if (!Array.isArray(input)) {
      return [];
    }

    return input.filter((item): item is DealAttachment => {
      if (!item || typeof item !== "object") {
        return false;
      }

      const candidate = item as DealAttachment;
      return typeof candidate.id === "string" && typeof candidate.name === "string" && typeof candidate.url === "string";
    });
  };

  return {
    id: identifier,
    title:
      typeof record.title === "string" && record.title.trim().length > 0
        ? record.title
        : `Presupuesto #${identifier}`,
    clientId: typeof record.clientId === "number" && Number.isFinite(record.clientId) ? record.clientId : null,
    clientName: typeof record.clientName === "string" ? record.clientName : null,
    sede: typeof record.sede === "string" ? record.sede : null,
    address: typeof record.address === "string" ? record.address : null,
    caes: typeof record.caes === "string" ? record.caes : null,
    fundae: typeof record.fundae === "string" ? record.fundae : null,
    hotelPernocta: typeof record.hotelPernocta === "string" ? record.hotelPernocta : null,
    pipelineId:
      typeof record.pipelineId === "number" && Number.isFinite(record.pipelineId) ? record.pipelineId : null,
    pipelineName: typeof record.pipelineName === "string" ? record.pipelineName : null,
    wonDate: typeof record.wonDate === "string" ? record.wonDate : null,
    formations: toStringArray(record.formations),
    trainingProducts: toDealProductArray(record.trainingProducts),
    extraProducts: toDealProductArray(record.extraProducts),
    notes: toDealNoteArray(record.notes),
    attachments: toDealAttachmentArray(record.attachments)
  } satisfies DealRecord;
};

const readStoredDeal = async (dealId: number): Promise<DealRecord | null> => {
  if (!Number.isFinite(dealId)) {
    return null;
  }

  const storedInMemory = inMemoryDeals.get(dealId);
  if (!db) {
    return storedInMemory ? storedInMemory.deal : null;
  }

  const ensured = await ensurePipedriveDealsTable();
  if (!ensured) {
    return storedInMemory ? storedInMemory.deal : null;
  }

  try {
    const result = await db
      .select({ data: pipedriveDeals.data })
      .from(pipedriveDeals)
      .where(eq(pipedriveDeals.dealId, dealId))
      .limit(1);

    if (result.length === 0) {
      return storedInMemory ? storedInMemory.deal : null;
    }

    const sanitized = sanitizeStoredDealRecord(result[0]?.data);
    if (sanitized) {
      inMemoryDeals.set(dealId, { deal: sanitized, updatedAt: new Date().toISOString() });
    }
    return sanitized;
  } catch (error) {
    console.error(`No se pudo leer el deal ${dealId} desde la base de datos`, error);
    return storedInMemory ? storedInMemory.deal : null;
  }
};

const listStoredDeals = async (): Promise<DealRecord[]> => {
  if (!db) {
    return readDealsFromMemory();
  }

  const ensured = await ensurePipedriveDealsTable();
  if (!ensured) {
    return readDealsFromMemory();
  }

  try {
    const result = await db
      .select({ data: pipedriveDeals.data })
      .from(pipedriveDeals)
      .orderBy(desc(pipedriveDeals.updatedAt), desc(pipedriveDeals.dealId));

    const deals: DealRecord[] = [];
    result.forEach((entry) => {
      const sanitized = sanitizeStoredDealRecord(entry.data);
      if (sanitized) {
        deals.push(sanitized);
        inMemoryDeals.set(sanitized.id, { deal: sanitized, updatedAt: new Date().toISOString() });
      }
    });
    return deals;
  } catch (error) {
    console.error("No se pudo leer la lista de deals almacenados", error);
    return readDealsFromMemory();
  }
};

const saveDealRecord = async (deal: DealRecord): Promise<void> => {
  const now = new Date();
  inMemoryDeals.set(deal.id, { deal, updatedAt: now.toISOString() });

  if (!db) {
    return;
  }

  const ensured = await ensurePipedriveDealsTable();
  if (!ensured) {
    return;
  }

  try {
    await db
      .insert(pipedriveDeals)
      .values({
        dealId: deal.id,
        title: deal.title,
        clientName: deal.clientName ?? null,
        pipelineId: deal.pipelineId ?? null,
        pipelineName: deal.pipelineName ?? null,
        wonDate: deal.wonDate ?? null,
        data: deal as unknown as Record<string, unknown>,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: pipedriveDeals.dealId,
        set: {
          title: deal.title,
          clientName: deal.clientName ?? null,
          pipelineId: deal.pipelineId ?? null,
          pipelineName: deal.pipelineName ?? null,
          wonDate: deal.wonDate ?? null,
          data: deal as unknown as Record<string, unknown>,
          updatedAt: now
        }
      });
  } catch (error) {
    console.error(`No se pudo guardar el deal ${deal.id} en la base de datos`, error);
  }
};

const deleteStoredDeal = async (dealId: number): Promise<boolean> => {
  const removedFromMemory = inMemoryDeals.delete(dealId);

  if (!db) {
    return removedFromMemory;
  }

  const ensured = await ensurePipedriveDealsTable();
  if (!ensured) {
    return removedFromMemory;
  }

  try {
    const result = await db
      .delete(pipedriveDeals)
      .where(eq(pipedriveDeals.dealId, dealId))
      .returning({ dealId: pipedriveDeals.dealId });

    return result.length > 0 || removedFromMemory;
  } catch (error) {
    console.error(`No se pudo eliminar el deal ${dealId} de la base de datos`, error);
    return removedFromMemory;
  }
};

const SHARED_STATE_KEYS = {
  calendarEvents: "calendar-events",
  manualDeals: "manual-deals",
  hiddenDeals: "hidden-deals",
  dealExtras: "deal-extras",
  dealFieldOptions: "deal-field-options"
} as const;

const parseBooleanFlag = (value: string | null): boolean => {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const parseDealIdentifier = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
};

const sanitizeNumberList = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<number>();

  value.forEach((item) => {
    if (typeof item === "number" && Number.isFinite(item)) {
      unique.add(item);
      return;
    }

    if (typeof item === "string") {
      const parsed = Number.parseInt(item, 10);
      if (Number.isFinite(parsed)) {
        unique.add(parsed);
      }
    }
  });

  return Array.from(unique.values());
};

type SharedExtrasPayload = {
  notes: unknown[];
  documents: unknown[];
};

const sanitizeSharedExtras = (value: unknown): SharedExtrasPayload => {
  if (!value || typeof value !== "object") {
    return { notes: [], documents: [] };
  }

  const record = value as Record<string, unknown>;
  const notes = Array.isArray(record.notes) ? record.notes : [];
  const documents = Array.isArray(record.documents) ? record.documents : [];
  return { notes, documents };
};

const toOptionalString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toOptionalUrl = (value: unknown): string | null => {
  const text = toOptionalString(value);
  if (!text) {
    return null;
  }

  try {
    const parsed = new URL(text);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    if (text.startsWith("//")) {
      try {
        const parsed = new URL(`https:${text}`);
        return parsed.toString();
      } catch {
        return null;
      }
    }

    return null;
  }

  return null;
};

const toStringWithFallback = (value: unknown, fallback: string): string =>
  toOptionalString(value) ?? fallback;

const toOptionalNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }

    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const normaliseRelatedEntity = (value: unknown): RelatedEntity => {
  if (value === null || value === undefined) {
    return { id: null, name: null, address: null };
  }

  if (typeof value === "number") {
    return { id: Number.isFinite(value) ? value : null, name: null, address: null };
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return { id: parsed, name: null, address: null };
    }

    return { id: null, name: toOptionalString(value), address: null };
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const id = toOptionalNumber(record.value ?? record.id);
    const name = toOptionalString(record.name);
    const address = toOptionalString(record.address);
    return { id, name, address };
  }

  return { id: null, name: null, address: null };
};

const readNestedString = (value: unknown, key: string): string | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  return toOptionalString(record[key]);
};

const normaliseComparisonText = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const BOOLEAN_SINGLE_OPTION_TRUE_VALUES = new Set([
  "1",
  "si",
  "s",
  "yes",
  "true"
]);

const BOOLEAN_SINGLE_OPTION_FALSE_VALUES = new Set([
  "0",
  "2",
  "no",
  "n",
  "false"
]);

const SINGLE_OPTION_SEDE_MAPPING: Record<string, string> = (() => {
  const entries: [string, string][] = [
    ["1", "GEP Arganda"],
    ["C/ Primavera, 1, 28500, Arganda del Rey, Madrid", "GEP Arganda"],
    ["GEP Arganda", "GEP Arganda"],
    ["2", "GEP Sabadell"],
    ["C/ Moratín, 100, 08206 Sabadell, Barcelona", "GEP Sabadell"],
    ["GEP Sabadell", "GEP Sabadell"],
    ["3", "In Company"],
    ["4", "In Company"],
    ["C/ Hungría, 11 Nave 1B. 11011, Cádiz", "In Company"],
    ["In Company - Unidad Móvil", "In Company"],
    ["In Company Unidad Móvil", "In Company"],
    ["In Company", "In Company"],
    ["Unidad Móvil", "In Company"],
    ["Unidad Movil", "In Company"],
    ["Incompany", "In Company"]
  ];

  const mapping: Record<string, string> = {};

  entries.forEach(([key, value]) => {
    mapping[normaliseComparisonText(key)] = value;
  });

  return mapping;
})();

const SINGLE_OPTION_FIELD_IDS = {
  pipelineId: "pipeline_id",
  caes: "e1971bf3a21d48737b682bf8d864ddc5eb15a351",
  fundae: "245d60d4d18aec40ba888998ef92e5d00e494583",
  hotelPernocta: "c3a6daf8eb5b4e59c3c07cda8e01f43439101269",
  sede: "676d6bd51e52999c582c01f67c99a35ed30bf6ae"
} as const;

type SingleOptionFieldOptions = Record<string, Record<string, string>>;

type DealFieldOptionsCacheEntry = {
  options: SingleOptionFieldOptions;
  fetchedAt: string;
};

const DEAL_FIELD_OPTIONS_TTL_MS = 1000 * 60 * 60 * 6; // 6 horas

let inMemoryDealFieldOptions: DealFieldOptionsCacheEntry | null = null;

const registerDealFieldOptionKey = (
  target: Record<string, string>,
  key: unknown,
  label: string
) => {
  if (typeof key === "number" && Number.isFinite(key)) {
    const text = String(key);
    target[text] = label;
    target[normaliseComparisonText(text)] = label;
    return;
  }

  if (typeof key === "string") {
    const trimmed = key.trim();

    if (trimmed.length === 0) {
      return;
    }

    target[trimmed] = label;
    target[normaliseComparisonText(trimmed)] = label;
  }
};

const extractSingleOptionFieldOptions = (
  fields: Record<string, unknown>[]
): SingleOptionFieldOptions => {
  const targetLookup = new Map<string, string>();

  const registerTargetIdentifier = (candidate: unknown, identifier: string) => {
    if (typeof candidate !== "string") {
      return;
    }

    const trimmed = candidate.trim();

    if (trimmed.length === 0) {
      return;
    }

    targetLookup.set(trimmed, identifier);
    targetLookup.set(normaliseComparisonText(trimmed), identifier);
  };

  Object.entries(SINGLE_OPTION_FIELD_IDS).forEach(([alias, identifier]) => {
    if (typeof identifier !== "string") {
      return;
    }

    registerTargetIdentifier(identifier, identifier);
    registerTargetIdentifier(alias, identifier);

    const snakeCaseAlias = alias.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
    registerTargetIdentifier(snakeCaseAlias, identifier);
    registerTargetIdentifier(snakeCaseAlias.replace(/_/g, " "), identifier);
  });

  const options: SingleOptionFieldOptions = {};

  const collectFieldIdentifiers = (record: Record<string, unknown>): string[] => {
    const identifiers = new Set<string>();

    const register = (value: unknown) => {
      if (typeof value === "string") {
        const trimmed = value.trim();

        if (trimmed.length === 0) {
          return;
        }

        identifiers.add(trimmed);
        identifiers.add(normaliseComparisonText(trimmed));
        return;
      }

      if (typeof value === "number" && Number.isFinite(value)) {
        const text = String(value);
        identifiers.add(text);
        identifiers.add(normaliseComparisonText(text));
      }
    };

    register(record.key);
    register(record.id);
    register(record.field_key);
    register((record as Record<string, unknown>)["fieldKey"]);
    register(record.name);
    register(record.label);
    register(record.title);

    return Array.from(identifiers);
  };

  const registerOptionMapAliases = (
    optionMap: Record<string, string>,
    identifiers: string[]
  ) => {
    identifiers.forEach((identifier) => {
      const trimmed = identifier.trim();

      if (trimmed.length === 0) {
        return;
      }

      options[trimmed] = optionMap;
      options[normaliseComparisonText(trimmed)] = optionMap;
    });
  };

  fields.forEach((field) => {
    if (!field || typeof field !== "object" || Array.isArray(field)) {
      return;
    }

    const record = field as Record<string, unknown>;
    const identifiers = collectFieldIdentifiers(record);

    let matchedKey: string | null = null;

    for (const identifier of identifiers) {
      const trimmed = identifier.trim();

      if (trimmed.length === 0) {
        continue;
      }

      const targetIdentifier =
        targetLookup.get(trimmed) ?? targetLookup.get(normaliseComparisonText(trimmed));

      if (targetIdentifier) {
        matchedKey = targetIdentifier;
        break;
      }
    }

    if (!matchedKey) {
      return;
    }

    const fieldOptions = Array.isArray(record.options) ? record.options : [];
    const optionMap: Record<string, string> = options[matchedKey] ?? {};

    fieldOptions.forEach((option) => {
      if (!option || typeof option !== "object") {
        return;
      }

      const optionRecord = option as Record<string, unknown>;
      const label =
        typeof optionRecord.label === "string" ? optionRecord.label.trim() : null;

      if (!label || label.length === 0) {
        return;
      }

      registerDealFieldOptionKey(optionMap, optionRecord.id, label);
      registerDealFieldOptionKey(optionMap, optionRecord.value, label);
      registerDealFieldOptionKey(optionMap, optionRecord.key, label);
    });

    options[matchedKey] = optionMap;
    registerOptionMapAliases(optionMap, identifiers);
  });

  return options;
};

const findSingleOptionFieldMap = (
  options: SingleOptionFieldOptions,
  fieldId: string
): Record<string, string> | null => {
  if (typeof fieldId !== "string") {
    return null;
  }

  const direct = options[fieldId];

  if (direct) {
    return direct;
  }

  const trimmed = fieldId.trim();

  if (trimmed.length === 0) {
    return null;
  }

  return (
    options[trimmed] ?? options[normaliseComparisonText(trimmed)] ?? null
  );
};

const shouldUseCachedDealFieldOptions = (entry: DealFieldOptionsCacheEntry | null): boolean => {
  if (!entry) {
    return false;
  }

  const timestamp = Date.parse(entry.fetchedAt);

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  return Date.now() - timestamp < DEAL_FIELD_OPTIONS_TTL_MS;
};

const fetchDealFieldOptions = async (): Promise<SingleOptionFieldOptions> => {
  const fields = await listDealFields();
  return extractSingleOptionFieldOptions(fields);
};

const loadDealFieldOptions = async (): Promise<SingleOptionFieldOptions> => {
  if (shouldUseCachedDealFieldOptions(inMemoryDealFieldOptions)) {
    return inMemoryDealFieldOptions!.options;
  }

  const stored = await readSharedState<DealFieldOptionsCacheEntry | null>(
    SHARED_STATE_KEYS.dealFieldOptions,
    null
  );

  if (shouldUseCachedDealFieldOptions(stored)) {
    inMemoryDealFieldOptions = stored;
    return stored!.options;
  }

  try {
    const options = await fetchDealFieldOptions();
    const entry: DealFieldOptionsCacheEntry = { options, fetchedAt: new Date().toISOString() };
    inMemoryDealFieldOptions = entry;
    await writeSharedState(SHARED_STATE_KEYS.dealFieldOptions, entry);
    return options;
  } catch (error) {
    console.error("No se pudieron actualizar los metadatos de campos de Pipedrive", error);

    if (stored) {
      inMemoryDealFieldOptions = stored;
      return stored.options;
    }

    return {};
  }
};

const resolveSingleOptionFieldValue = (
  value: string | null,
  fieldId: string,
  options: SingleOptionFieldOptions
): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const fieldOptions = findSingleOptionFieldMap(options, fieldId);

  if (!fieldOptions) {
    return trimmed;
  }

  const normalized = normaliseComparisonText(trimmed);
  return fieldOptions[trimmed] ?? fieldOptions[normalized] ?? trimmed;
};

const mapSingleOptionBooleanValue = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  const normalized = normaliseComparisonText(value);

  if (normalized.length === 0) {
    return null;
  }

  if (BOOLEAN_SINGLE_OPTION_TRUE_VALUES.has(normalized)) {
    return "Sí";
  }

  if (BOOLEAN_SINGLE_OPTION_FALSE_VALUES.has(normalized)) {
    return "No";
  }

  return value;
};

const mapSedeValue = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  const normalized = normaliseComparisonText(value);

  if (normalized.length === 0) {
    return null;
  }

  return SINGLE_OPTION_SEDE_MAPPING[normalized] ?? value;
};

const toOptionalText = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
};

const toOptionalBoolean = (value: unknown): boolean | null => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }

    if (value === 0) {
      return false;
    }
  }

  if (typeof value === "string") {
    const normalized = normaliseComparisonText(value);

    if (normalized.length === 0) {
      return null;
    }

    if (["1", "true", "t", "yes", "y", "si", "s", "on"].includes(normalized)) {
      return true;
    }

    if (["0", "false", "f", "no", "n", "off"].includes(normalized)) {
      return false;
    }
  }

  return null;
};

const normaliseArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = ["items", "data", "values", "results"];

    for (const key of keys) {
      const nested = record[key];
      if (Array.isArray(nested)) {
        return nested;
      }
    }
  }

  return [];
};

const ensureId = (value: unknown, prefix: string, index: number): string => {
  const text = toOptionalText(value);
  if (text) {
    return text;
  }

  return `${prefix}-${index}`;
};

const readFieldRecordText = (record: Record<string, unknown>): string | null =>
  toOptionalText(record.label) ??
  toOptionalText(record.name) ??
  toOptionalText(record.text) ??
  toOptionalText(record.title) ??
  toOptionalText(record.value);

const toStringList = (value: unknown): string[] => {
  const set = new Set<string>();

  const pushValue = (input: string) => {
    input
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .forEach((item) => set.add(item));
  };

  const process = (entry: unknown) => {
    if (typeof entry === "string") {
      if (entry.trim().length > 0) {
        pushValue(entry);
      }
      return;
    }

    if (typeof entry === "number" && Number.isFinite(entry)) {
      pushValue(String(entry));
      return;
    }

    if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      const direct = readFieldRecordText(record);

      if (direct) {
        process(direct);
      }

      const nestedKeys = ["options", "values", "items", "data"];
      nestedKeys.forEach((key) => {
        const nested = record[key];
        if (Array.isArray(nested)) {
          nested.forEach(process);
        } else if (nested !== undefined && nested !== entry) {
          process(nested);
        }
      });
    }
  };

  if (Array.isArray(value)) {
    value.forEach(process);
  } else {
    process(value);
  }

  return Array.from(set);
};

const toOptionalFieldText = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    const parts = toStringList(value);
    if (parts.length === 0) {
      return null;
    }

    return parts.join(", ");
  }

  const direct = toOptionalText(value);
  if (direct) {
    return direct;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return readFieldRecordText(record);
  }

  return null;
};

const pushUniqueNote = (collection: DealNote[], note: DealNote) => {
  if (!collection.some((existing) => existing.id === note.id)) {
    collection.push(note);
  }
};

const pushUniqueAttachment = (collection: DealAttachment[], attachment: DealAttachment) => {
  if (!collection.some((existing) => existing.id === attachment.id)) {
    collection.push(attachment);
  }
};

const readValueByPath = (record: Record<string, unknown>, key: string): unknown => {
  const segments = key.split(".");
  let current: unknown = record;

  for (const segment of segments) {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
};

const collectProductRecords = (record: Record<string, unknown>): Record<string, unknown>[] => {
  const queue: Record<string, unknown>[] = [record];
  const result: Record<string, unknown>[] = [];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (visited.has(current)) {
      continue;
    }

    visited.add(current);
    result.push(current);

    const nestedKeys = [
      "product",
      "product_data",
      "productData",
      "product_details",
      "productDetails",
      "item",
      "product_item",
      "productItem",
      "details",
      "data",
      "related_objects",
      "relatedObjects"
    ];

    nestedKeys.forEach((key) => {
      const nested = (current as Record<string, unknown>)[key];
      if (nested && typeof nested === "object" && !Array.isArray(nested)) {
        queue.push(nested as Record<string, unknown>);
      }
    });

    const custom =
      (current as Record<string, unknown>).custom_fields ??
      (current as Record<string, unknown>).customFields;

    if (custom && typeof custom === "object" && !Array.isArray(custom)) {
      queue.push(custom as Record<string, unknown>);
    }
  }

  return result;
};

const collectDealRecords = (record: Record<string, unknown>): Record<string, unknown>[] => {
  const queue: Record<string, unknown>[] = [record];
  const result: Record<string, unknown>[] = [];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (visited.has(current)) {
      continue;
    }

    visited.add(current);
    result.push(current);

    const nestedKeys = [
      "custom_fields",
      "customFields",
      "additional_data",
      "additionalData",
      "deal",
      "data",
      "values",
      "value",
      "fields",
      "field",
      "metadata",
      "meta",
      "details",
      "info",
      "related_objects",
      "relatedObjects",
      "related"
    ];

    nestedKeys.forEach((key) => {
      const nested = (current as Record<string, unknown>)[key];
      if (nested && typeof nested === "object" && !Array.isArray(nested)) {
        queue.push(nested as Record<string, unknown>);
      }
    });
  }

  return result;
};

const findFirstValue = (records: Record<string, unknown>[], keys: string[]): unknown => {
  for (const record of records) {
    for (const key of keys) {
      const value = readValueByPath(record, key);

      if (value === undefined || value === null) {
        continue;
      }

      if (typeof value === "string" && value.trim().length === 0) {
        continue;
      }

      return value;
    }
  }

  return undefined;
};

const parseRecommendedHoursValue = (
  value: unknown
): { numeric: number | null; raw: string | null } => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { numeric: value, raw: String(value) };
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return { numeric: null, raw: null };
    }

    const normalized = trimmed.replace(/,/g, ".");
    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    const numeric = match ? Number.parseFloat(match[0]) : Number.NaN;

    return {
      numeric: Number.isFinite(numeric) ? numeric : null,
      raw: trimmed
    };
  }

  return { numeric: null, raw: null };
};

const parseRecommendedHours = (records: Record<string, unknown>[]) => {
  const valueCandidate = findFirstValue(records, [
    "recommended_hours",
    "recommendedHours",
    "recommended_hours_value",
    "horas_recomendadas",
    "horasRecomendadas",
    "hours",
    "duration_hours",
    "durationHours",
    "duration"
  ]);

  const textCandidate = findFirstValue(records, [
    "recommended_hours_text",
    "recommendedHoursText",
    "recommended_hours_raw",
    "recommendedHoursRaw",
    "horas_recomendadas_texto",
    "horasRecomendadasTexto",
    "recommended_hours_label",
    "recommendedHoursLabel"
  ]);

  let result = parseRecommendedHoursValue(valueCandidate);

  if (!result.raw && textCandidate !== undefined) {
    const textResult = parseRecommendedHoursValue(textCandidate);

    if (textResult.raw) {
      result = {
        numeric: result.numeric ?? textResult.numeric,
        raw: textResult.raw
      };
    }
  }

  if (!result.raw && valueCandidate !== undefined && typeof valueCandidate === "number") {
    result = {
      numeric: result.numeric ?? (Number.isFinite(valueCandidate) ? valueCandidate : null),
      raw: String(valueCandidate)
    };
  }

  return result;
};

const parsePipedriveNotes = (
  value: unknown,
  source: "deal" | "product",
  overrides: { productId: number | null; dealProductId: number | null },
  idPrefix: string
): DealNote[] => {
  const result: DealNote[] = [];
  const entries = normaliseArray(value);

  if (entries.length > 0) {
    entries.forEach((entry, index) => {
      if (!entry || typeof entry !== "object") {
        const text = toOptionalText(entry);
        if (!text) {
          return;
        }

        result.push({
          id: `${idPrefix}-${source}-note-${index}`,
          content: text,
          createdAt: null,
          authorName: null,
          source,
          productId: overrides.productId,
          dealProductId: overrides.dealProductId
        });
        return;
      }

      const record = entry as Record<string, unknown>;
      const id = ensureId(
        record.id ?? record.note_id ?? record.uuid ?? record.key,
        `${idPrefix}-${source}-note`,
        index
      );

      const content =
        toOptionalString(record.content) ??
        toOptionalString(record.note) ??
        toOptionalString(record.body) ??
        toOptionalString(record.text) ??
        toOptionalString(record.value) ??
        null;

      if (!content) {
        return;
      }

      const createdAt =
        toOptionalString(record.add_time) ??
        toOptionalString(record.created_at) ??
        toOptionalString(record.created) ??
        toOptionalString(record.timestamp) ??
        toOptionalString(record.date) ??
        null;

      const authorName =
        toOptionalString(record.user_name) ??
        toOptionalString(record.author_name) ??
        toOptionalString(record.added_by_user_name) ??
        readNestedString(record.user_id, "name") ??
        readNestedString(record.author, "name") ??
        readNestedString(record.added_by_user, "name") ??
        null;

      const productId =
        toOptionalNumber(record.product_id) ?? overrides.productId;

      const dealProductId =
        toOptionalNumber(record.deal_product_id) ?? overrides.dealProductId;

      result.push({
        id,
        content,
        createdAt,
        authorName,
        source,
        productId,
        dealProductId
      });
    });

    return result;
  }

  const text = toOptionalText(value);
  if (text) {
    result.push({
      id: `${idPrefix}-${source}-note-0`,
      content: text,
      createdAt: null,
      authorName: null,
      source,
      productId: overrides.productId,
      dealProductId: overrides.dealProductId
    });
  }

  return result;
};

const parsePipedriveAttachments = (
  value: unknown,
  source: "deal" | "product",
  overrides: { productId: number | null; dealProductId: number | null },
  idPrefix: string
): DealAttachment[] => {
  const result: DealAttachment[] = [];
  const entries = normaliseArray(value);

  if (entries.length > 0) {
    entries.forEach((entry, index) => {
      if (!entry || typeof entry !== "object") {
        const text = toOptionalText(entry);
        if (!text) {
          return;
        }

        result.push({
          id: `${idPrefix}-${source}-attachment-${index}`,
          name: text,
          url: text,
          downloadUrl: text,
          fileType: null,
          addedAt: null,
          addedBy: null,
          source,
          productId: overrides.productId,
          dealProductId: overrides.dealProductId
        });
        return;
      }

      const record = entry as Record<string, unknown>;
      const id = ensureId(
        record.id ?? record.file_id ?? record.uuid ?? record.key,
        `${idPrefix}-${source}-attachment`,
        index
      );

      const name =
        toOptionalText(record.name) ??
        toOptionalText(record.file_name) ??
        toOptionalText(record.title) ??
        toOptionalText(record.filename) ??
        `Archivo ${index + 1}`;

      const url =
        toOptionalUrl(record.url) ??
        toOptionalUrl(record.download_url) ??
        toOptionalUrl(record.link) ??
        toOptionalUrl(record.file_url) ??
        toOptionalUrl(record.view_url) ??
        null;

      const downloadUrl =
        toOptionalUrl(record.download_url) ??
        toOptionalUrl(record.url) ??
        toOptionalUrl(record.link) ??
        null;

      if (!url && !downloadUrl) {
        return;
      }

      const fileType =
        toOptionalString(record.file_type) ??
        toOptionalString(record.content_type) ??
        toOptionalString(record.mime_type) ??
        toOptionalString(record.mimetype) ??
        null;

      const addedAt =
        toOptionalString(record.add_time) ??
        toOptionalString(record.created_at) ??
        toOptionalString(record.created) ??
        toOptionalString(record.updated_at) ??
        null;

      const addedBy =
        toOptionalString(record.user_name) ??
        toOptionalString(record.added_by_user_name) ??
        toOptionalString(record.author_name) ??
        readNestedString(record.user_id, "name") ??
        readNestedString(record.added_by_user, "name") ??
        null;

      const productId =
        toOptionalNumber(record.product_id) ?? overrides.productId;

      const dealProductId =
        toOptionalNumber(record.deal_product_id) ?? overrides.dealProductId;

      result.push({
        id,
        name: toStringWithFallback(name, `Archivo ${index + 1}`),
        url: url ?? downloadUrl ?? "",
        downloadUrl,
        fileType,
        addedAt,
        addedBy,
        source,
        productId,
        dealProductId
      });
    });

    return result;
  }

  const text = toOptionalText(value);
  if (text) {
    const url = toOptionalUrl(text);
    if (!url) {
      return result;
    }

    result.push({
      id: `${idPrefix}-${source}-attachment-0`,
      name: text,
      url,
      downloadUrl: url,
      fileType: null,
      addedAt: null,
      addedBy: null,
      source,
      productId: overrides.productId,
      dealProductId: overrides.dealProductId
    });
  }

  return result;
};

const parseDealProducts = (
  dealId: number,
  deal: Record<string, unknown>,
  noteAccumulator: DealNote[],
  attachmentAccumulator: DealAttachment[]
): DealProduct[] => {
  let fallbackCounter = 1;
  const generateFallbackId = () => -fallbackCounter++;

  const productSources: { value: unknown }[] = [
    { value: deal["products"] },
    { value: deal["product_items"] },
    { value: deal["productItems"] },
    { value: deal["deal_products"] },
    { value: deal["dealProducts"] },
    { value: deal["items"] },
    { value: readValueByPath(deal, "product_data") },
    { value: readValueByPath(deal, "productData") },
    { value: readValueByPath(deal, "additional_data.products") },
    { value: readValueByPath(deal, "additional_data.items") },
    { value: readValueByPath(deal, "additional_data.deal.products") },
    { value: readValueByPath(deal, "additional_data.deal.product_items") },
    { value: readValueByPath(deal, "additional_data.deal.items") },
    { value: readValueByPath(deal, "additionalData.products") },
    { value: readValueByPath(deal, "additionalData.items") },
    { value: readValueByPath(deal, "additionalData.deal.products") },
    { value: readValueByPath(deal, "additionalData.deal.product_items") },
    { value: readValueByPath(deal, "additionalData.deal.items") },
    { value: readValueByPath(deal, "related_objects.products") },
    { value: readValueByPath(deal, "related_objects.product_items") },
    { value: readValueByPath(deal, "related_objects.deal_products") },
    { value: readValueByPath(deal, "related_objects.dealProducts") },
    { value: readValueByPath(deal, "relatedObjects.products") },
    { value: readValueByPath(deal, "relatedObjects.product_items") },
    { value: readValueByPath(deal, "relatedObjects.deal_products") },
    { value: deal["training_products"] },
    { value: deal["trainingProducts"] },
    { value: deal["extra_products"] },
    { value: deal["extraProducts"] }
  ];

  const productMap = new Map<number, DealProduct>();

  productSources.forEach(({ value }) => {
    const entries = normaliseArray(value);

    entries.forEach((entry, index) => {
      if (!entry || typeof entry !== "object") {
        const text = toOptionalText(entry);
        if (!text) {
          return;
        }

        const generatedId = generateFallbackId();
        const product: DealProduct = {
          dealProductId: generatedId,
          productId: null,
          name: text,
          code: null,
          quantity: 0,
          itemPrice: null,
          recommendedHours: null,
          recommendedHoursRaw: null,
          notes: [],
          attachments: [],
          isTraining: false
        };

        if (!productMap.has(product.dealProductId)) {
          productMap.set(product.dealProductId, product);
        }

        return;
      }

      const record = entry as Record<string, unknown>;
      const candidateRecords = collectProductRecords(record);

      const dealProductId =
        toOptionalNumber(
          findFirstValue([candidateRecords[0]], [
            "deal_product_id",
            "dealProductId",
            "id",
            "item_id",
            "itemId",
            "deal_item_id",
            "dealItemId"
          ])
        ) ?? generateFallbackId();

      const productIdValue = findFirstValue(candidateRecords, [
        "product_id",
        "productId",
        "product_id.value",
        "product_id.id",
        "product.id",
        "item.id"
      ]);
      const productId = toOptionalNumber(productIdValue);

      const nameValue = findFirstValue(candidateRecords, [
        "name",
        "product_name",
        "product.name",
        "item.name",
        "title",
        "product.title"
      ]);
      const name = toStringWithFallback(
        toOptionalText(nameValue) ?? `Producto ${dealProductId}`,
        `Producto ${dealProductId}`
      );

      const codeValue = findFirstValue(candidateRecords, [
        "code",
        "product_code",
        "product.code",
        "item.code",
        "sku",
        "sku_code"
      ]);
      const code = toOptionalText(codeValue);
      const normalizedCode = typeof code === "string" ? code.trim().toLocaleLowerCase("es") : null;

      const quantityValue = findFirstValue(candidateRecords, [
        "quantity",
        "qty",
        "count",
        "sessions",
        "cantidad"
      ]);

      let quantity = 0;
      if (typeof quantityValue === "number" && Number.isFinite(quantityValue)) {
        quantity = quantityValue;
      } else if (typeof quantityValue === "string") {
        const parsed = Number.parseFloat(quantityValue.replace(/,/g, "."));
        if (Number.isFinite(parsed)) {
          quantity = parsed;
        }
      }

      const priceValue = findFirstValue(candidateRecords, [
        "item_price",
        "price",
        "unit_price",
        "unitPrice",
        "amount"
      ]);

      let itemPrice: number | null = null;
      if (typeof priceValue === "number" && Number.isFinite(priceValue)) {
        itemPrice = priceValue;
      } else if (typeof priceValue === "string") {
        const parsed = Number.parseFloat(priceValue.replace(/,/g, "."));
        itemPrice = Number.isFinite(parsed) ? parsed : null;
      }

      const recommended = parseRecommendedHours(candidateRecords);

      const productNotesRaw = findFirstValue(candidateRecords, [
        "notes",
        "note",
        "comments",
        "comment",
        "product_notes",
        "productNotes",
        "observaciones",
        "descripcion"
      ]);

      const productNotes = parsePipedriveNotes(
        productNotesRaw,
        "product",
        { productId: productId ?? null, dealProductId },
        `${dealId}-${dealProductId}-prod`
      );
      productNotes.forEach((note) => pushUniqueNote(noteAccumulator, note));

      const attachmentsRaw = findFirstValue(candidateRecords, [
        "files",
        "attachments",
        "documents",
        "product_files",
        "productFiles",
        "archivos"
      ]);

      const productAttachments = parsePipedriveAttachments(
        attachmentsRaw,
        "product",
        { productId: productId ?? null, dealProductId },
        `${dealId}-${dealProductId}-prod`
      );
      productAttachments.forEach((attachment) =>
        pushUniqueAttachment(attachmentAccumulator, attachment)
      );

      const isTraining = normalizedCode !== null && normalizedCode.includes("form-");

      const product: DealProduct = {
        dealProductId,
        productId: productId ?? null,
        name,
        code,
        quantity,
        itemPrice,
        recommendedHours: recommended.numeric,
        recommendedHoursRaw: recommended.raw,
        notes: productNotes,
        attachments: productAttachments,
        isTraining
      };

      if (!productMap.has(product.dealProductId)) {
        productMap.set(product.dealProductId, product);
      } else {
        const existing = productMap.get(product.dealProductId)!;
        productMap.set(product.dealProductId, {
          ...existing,
          productId: existing.productId ?? product.productId,
          name: existing.name || product.name,
          code: existing.code ?? product.code,
          quantity: existing.quantity || product.quantity,
          itemPrice: existing.itemPrice ?? product.itemPrice,
          recommendedHours: existing.recommendedHours ?? product.recommendedHours,
          recommendedHoursRaw: existing.recommendedHoursRaw ?? product.recommendedHoursRaw,
          notes: existing.notes.length > 0 ? existing.notes : product.notes,
          attachments:
            existing.attachments.length > 0 ? existing.attachments : product.attachments,
          isTraining: existing.isTraining || product.isTraining
        });
      }
    });
  });

  return Array.from(productMap.values());
};

const parseDealFormations = (deal: Record<string, unknown>): string[] => {
  const formationCandidates = [
    deal["formations"],
    deal["formaciones"],
    deal["formacion"],
    deal["courses"],
    deal["course_names"],
    deal["training_formations"],
    deal["trainingFormations"],
    deal["deal_formations"],
    deal["dealFormations"],
    readValueByPath(deal, "custom_fields.formations"),
    readValueByPath(deal, "custom_fields.formaciones"),
    readValueByPath(deal, "customFields.formations"),
    readValueByPath(deal, "customFields.formaciones")
  ];

  const set = new Set<string>();

  formationCandidates.forEach((candidate) => {
    toStringList(candidate).forEach((item) => set.add(item));
  });

  return Array.from(set);
};

const mapPipedriveDealToRecord = (
  deal: Record<string, unknown>,
  fieldOptions: SingleOptionFieldOptions
): DealRecord => {
  const dealId = toOptionalNumber(deal["id"]);

  if (dealId === null) {
    throw new Error("Pipedrive devolvió un deal sin identificador numérico");
  }

  const dealRecords = collectDealRecords(deal);

  const org = normaliseRelatedEntity(
    findFirstValue(dealRecords, ["org_id", "organization", "org"]) ?? deal["org_id"]
  );
  const person = normaliseRelatedEntity(
    findFirstValue(dealRecords, ["person_id", "person", "contact"]) ?? deal["person_id"]
  );

  const pipelineIdValue = findFirstValue(dealRecords, ["pipeline_id", "pipelineId", "pipeline.id"]);
  const pipelineId = toOptionalNumber(pipelineIdValue) ?? toOptionalNumber(deal["pipeline_id"]);

  const rawPipelineSelection =
    toOptionalFieldText(
      findFirstValue(dealRecords, [
        "pipeline",
        "pipeline_id",
        "pipelineId",
        "pipeline.id",
        SINGLE_OPTION_FIELD_IDS.pipelineId
      ])
    ) ?? (pipelineId != null ? String(pipelineId) : null);

  const resolvedPipelineName = resolveSingleOptionFieldValue(
    rawPipelineSelection,
    SINGLE_OPTION_FIELD_IDS.pipelineId,
    fieldOptions
  );

  const pipelineName =
    resolvedPipelineName ??
    toOptionalFieldText(findFirstValue(dealRecords, ["pipeline_name", "pipeline.name"])) ??
    readNestedString(deal["pipeline"], "name");

  const addressCandidate = findFirstValue(
    dealRecords,
    [
      "org_address",
      "organization.address",
      "org.address",
      "org_id.address",
      "address"
    ]
  );
  const address = toOptionalFieldText(addressCandidate) ?? org.address ?? person.address ?? null;

  const clientName =
    toOptionalFieldText(
      findFirstValue(dealRecords, ["org_name", "organization.name", "org.name"])
    ) ??
    org.name ??
    toOptionalFieldText(
      findFirstValue(dealRecords, ["person_name", "person.name", "contact.name"])
    ) ??
    person.name;

  const wonDate =
    toOptionalString(
      findFirstValue(dealRecords, ["won_time", "wonTime", "won_date", "wonDate"])
    ) ??
    toOptionalString(deal["won_time"]) ??
    toOptionalString(deal["won_date"]) ??
    toOptionalString(deal["wonTime"]);

  const rawSede = toOptionalFieldText(
    findFirstValue(dealRecords, [
      "sede",
      "sede.name",
      "676d6bd51e52999c582c01f67c99a35ed30bf6ae",
      "custom_fields.sede",
      "custom_fields.676d6bd51e52999c582c01f67c99a35ed30bf6ae",
      "customFields.sede",
      "customFields.676d6bd51e52999c582c01f67c99a35ed30bf6ae",
      "additional_data.custom_fields.676d6bd51e52999c582c01f67c99a35ed30bf6ae",
      "additional_data.fields.676d6bd51e52999c582c01f67c99a35ed30bf6ae",
      "additionalData.custom_fields.676d6bd51e52999c582c01f67c99a35ed30bf6ae",
      "additionalData.fields.676d6bd51e52999c582c01f67c99a35ed30bf6ae"
    ])
  );

  const rawCaes = toOptionalFieldText(
    findFirstValue(dealRecords, [
      "caes",
      "caes.name",
      "e1971bf3a21d48737b682bf8d864ddc5eb15a351",
      "custom_fields.caes",
      "custom_fields.e1971bf3a21d48737b682bf8d864ddc5eb15a351",
      "customFields.caes",
      "customFields.e1971bf3a21d48737b682bf8d864ddc5eb15a351",
      "additional_data.custom_fields.e1971bf3a21d48737b682bf8d864ddc5eb15a351",
      "additional_data.fields.e1971bf3a21d48737b682bf8d864ddc5eb15a351",
      "additionalData.custom_fields.e1971bf3a21d48737b682bf8d864ddc5eb15a351",
      "additionalData.fields.e1971bf3a21d48737b682bf8d864ddc5eb15a351"
    ])
  );

  const rawFundae = toOptionalFieldText(
    findFirstValue(dealRecords, [
      "fundae",
      "fundae.name",
      "245d60d4d18aec40ba888998ef92e5d00e494583",
      "custom_fields.fundae",
      "custom_fields.245d60d4d18aec40ba888998ef92e5d00e494583",
      "customFields.fundae",
      "customFields.245d60d4d18aec40ba888998ef92e5d00e494583",
      "additional_data.custom_fields.245d60d4d18aec40ba888998ef92e5d00e494583",
      "additional_data.fields.245d60d4d18aec40ba888998ef92e5d00e494583",
      "additionalData.custom_fields.245d60d4d18aec40ba888998ef92e5d00e494583",
      "additionalData.fields.245d60d4d18aec40ba888998ef92e5d00e494583"
    ])
  );

  const rawHotelPernocta = toOptionalFieldText(
    findFirstValue(dealRecords, [
      "hotelPernocta",
      "hotel_pernocta",
      "c3a6daf8eb5b4e59c3c07cda8e01f43439101269",
      "custom_fields.hotelPernocta",
      "custom_fields.hotel_pernocta",
      "custom_fields.c3a6daf8eb5b4e59c3c07cda8e01f43439101269",
      "customFields.hotelPernocta",
      "customFields.hotel_pernocta",
      "customFields.c3a6daf8eb5b4e59c3c07cda8e01f43439101269",
      "additional_data.custom_fields.c3a6daf8eb5b4e59c3c07cda8e01f43439101269",
      "additional_data.fields.c3a6daf8eb5b4e59c3c07cda8e01f43439101269",
      "additionalData.custom_fields.c3a6daf8eb5b4e59c3c07cda8e01f43439101269",
      "additionalData.fields.c3a6daf8eb5b4e59c3c07cda8e01f43439101269"
    ])
  );

  const resolvedSede = resolveSingleOptionFieldValue(
    rawSede,
    SINGLE_OPTION_FIELD_IDS.sede,
    fieldOptions
  );
  const resolvedCaes = resolveSingleOptionFieldValue(
    rawCaes,
    SINGLE_OPTION_FIELD_IDS.caes,
    fieldOptions
  );
  const resolvedFundae = resolveSingleOptionFieldValue(
    rawFundae,
    SINGLE_OPTION_FIELD_IDS.fundae,
    fieldOptions
  );
  const resolvedHotelPernocta = resolveSingleOptionFieldValue(
    rawHotelPernocta,
    SINGLE_OPTION_FIELD_IDS.hotelPernocta,
    fieldOptions
  );

  const sede = mapSedeValue(resolvedSede);
  const caes = mapSingleOptionBooleanValue(resolvedCaes);
  const fundae = mapSingleOptionBooleanValue(resolvedFundae);
  const hotelPernocta = mapSingleOptionBooleanValue(resolvedHotelPernocta);

  const formations = parseDealFormations(deal);
  const notes: DealNote[] = [];
  const attachments: DealAttachment[] = [];

  const products = parseDealProducts(dealId, deal, notes, attachments);

  const noteSources: unknown[] = [
    deal["notes"],
    deal["deal_notes"],
    deal["extra_notes"],
    readValueByPath(deal, "additional_data.notes"),
    readValueByPath(deal, "additional_data.deal.notes"),
    readValueByPath(deal, "additionalData.notes"),
    readValueByPath(deal, "additionalData.deal.notes"),
    readValueByPath(deal, "notes.items"),
    readValueByPath(deal, "related_objects.notes"),
    readValueByPath(deal, "related_objects.note"),
    readValueByPath(deal, "relatedObjects.notes"),
    readValueByPath(deal, "relatedObjects.note")
  ];

  noteSources.forEach((value) => {
    const parsed = parsePipedriveNotes(
      value,
      "deal",
      { productId: null, dealProductId: null },
      `${dealId}`
    );
    parsed.forEach((note) => pushUniqueNote(notes, note));
  });

  const attachmentSources: unknown[] = [
    deal["files"],
    deal["attachments"],
    deal["deal_files"],
    deal["extra_files"],
    deal["documents"],
    readValueByPath(deal, "additional_data.files"),
    readValueByPath(deal, "additional_data.deal.files"),
    readValueByPath(deal, "additional_data.deal.attachments"),
    readValueByPath(deal, "additionalData.files"),
    readValueByPath(deal, "additionalData.deal.files"),
    readValueByPath(deal, "additionalData.deal.attachments"),
    readValueByPath(deal, "attachments.items"),
    readValueByPath(deal, "related_objects.files"),
    readValueByPath(deal, "related_objects.attachments"),
    readValueByPath(deal, "relatedObjects.files"),
    readValueByPath(deal, "relatedObjects.attachments")
  ];

  attachmentSources.forEach((value) => {
    const parsed = parsePipedriveAttachments(
      value,
      "deal",
      { productId: null, dealProductId: null },
      `${dealId}`
    );
    parsed.forEach((attachment) => pushUniqueAttachment(attachments, attachment));
  });

  const trainingProducts = products.filter((product) => product.isTraining);
  const extraProducts = products.filter((product) => !product.isTraining);

  const formationMap = new Map<string, string>();
  const registerFormation = (value: string | null | undefined) => {
    if (typeof value !== "string") {
      return;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return;
    }

    const normalized = normaliseComparisonText(trimmed);
    if (!formationMap.has(normalized)) {
      formationMap.set(normalized, trimmed);
    }
  };

  formations.forEach((item) => registerFormation(item));
  trainingProducts.forEach((product) => registerFormation(product.name));

  const combinedFormations = Array.from(formationMap.values());

  return {
    id: dealId,
    title: toStringWithFallback(deal["title"], `Presupuesto #${dealId}`),
    clientId: org.id ?? person.id ?? null,
    clientName: clientName ?? null,
    sede: sede ?? null,
    address: address ?? null,
    caes: caes ?? null,
    fundae: fundae ?? null,
    hotelPernocta: hotelPernocta ?? null,
    pipelineId,
    pipelineName: pipelineName ?? null,
    wonDate,
    formations: combinedFormations,
    trainingProducts,
    extraProducts,
    notes,
    attachments
  };
};

let pipedriveSyncPromise: Promise<void> | null = null;

const synchronizeDealsFromPipedrive = async (
  options: { force?: boolean; knownDeals?: DealRecord[] } = {}
): Promise<void> => {
  const shouldForce = options.force ?? false;
  const knownDeals = options.knownDeals ?? [];
  const knownDealIds = new Set(knownDeals.map((deal) => deal.id));

  const executeSync = async () => {
    let remoteDeals: unknown[];
    try {
      remoteDeals = await listDealsUpdatedDesc(100);
    } catch (error) {
      console.error("No se pudo obtener la lista de deals desde Pipedrive", error);
      return;
    }

    let fieldOptions: SingleOptionFieldOptions = {};

    try {
      fieldOptions = await loadDealFieldOptions();
    } catch (error) {
      console.error("No se pudieron cargar los metadatos de campos de Pipedrive", error);
      fieldOptions = {};
    }

    const identifiers: number[] = [];
    remoteDeals.forEach((entry) => {
      if (!entry || typeof entry !== "object") {
        return;
      }

      const record = entry as Record<string, unknown>;
      const identifier = parseDealIdentifier(record.id);

      if (identifier !== null) {
        identifiers.push(identifier);
      }
    });

    const uniqueIdentifiers = Array.from(new Set(identifiers));

    for (const dealId of uniqueIdentifiers) {
      if (!shouldForce && knownDealIds.has(dealId)) {
        continue;
      }

      try {
        const rawDeal = await getDealById(dealId);

        if (!rawDeal) {
          await deleteStoredDeal(dealId);
          continue;
        }

        if (typeof rawDeal !== "object" || rawDeal === null) {
          throw new Error("Respuesta inesperada al obtener un deal desde Pipedrive");
        }

        const deal = mapPipedriveDealToRecord(
          rawDeal as Record<string, unknown>,
          fieldOptions
        );
        await saveDealRecord(deal);
      } catch (error) {
        console.error(`No se pudo sincronizar el deal ${dealId} desde Pipedrive`, error);
      }
    }
  };

  if (shouldForce && pipedriveSyncPromise) {
    try {
      await pipedriveSyncPromise;
    } catch (error) {
      console.error("La sincronización anterior de deals finalizó con errores", error);
    }
    pipedriveSyncPromise = null;
  }

  if (!pipedriveSyncPromise) {
    pipedriveSyncPromise = executeSync().finally(() => {
      pipedriveSyncPromise = null;
    });
  }

  try {
    await pipedriveSyncPromise;
  } catch (error) {
    console.error("La sincronización de deals con Pipedrive falló", error);
  }
};

const app = new Hono().basePath("/.netlify/functions/api");
app.use("*", cors());

app.get("/calendar-events", async (c) => {
  const events = await readSharedState<unknown[]>(SHARED_STATE_KEYS.calendarEvents, []);
  return c.json({ events });
});

app.put("/calendar-events", async (c) => {
  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch (error) {
    console.error("No se pudo leer el cuerpo de la solicitud de calendario", error);
    return c.json({ ok: false, message: "No se pudo leer la información del calendario." }, 400);
  }

  const events = (payload as { events?: unknown }).events;

  if (!Array.isArray(events)) {
    return c.json({ ok: false, message: "El formato de los eventos no es válido." }, 400);
  }

  await writeSharedState(SHARED_STATE_KEYS.calendarEvents, events);
  return c.json({ ok: true, updatedAt: new Date().toISOString() });
});

app.get("/manual-deals", async (c) => {
  const deals = await readSharedState<unknown[]>(SHARED_STATE_KEYS.manualDeals, []);
  return c.json({ deals });
});

app.put("/manual-deals", async (c) => {
  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch (error) {
    console.error("No se pudo leer el cuerpo de la solicitud de deals manuales", error);
    return c.json({ ok: false, message: "No se pudo leer la información de los presupuestos manuales." }, 400);
  }

  const deals = (payload as { deals?: unknown }).deals;

  if (!Array.isArray(deals)) {
    return c.json({ ok: false, message: "El formato de los presupuestos manuales no es válido." }, 400);
  }

  await writeSharedState(SHARED_STATE_KEYS.manualDeals, deals);
  return c.json({ ok: true, updatedAt: new Date().toISOString() });
});

app.get("/hidden-deals", async (c) => {
  const stored = await readSharedState<unknown>(SHARED_STATE_KEYS.hiddenDeals, []);
  const dealIds = sanitizeNumberList(stored);
  return c.json({ dealIds });
});

app.put("/hidden-deals", async (c) => {
  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch (error) {
    console.error("No se pudo leer el cuerpo de la solicitud de deals ocultos", error);
    return c.json({ ok: false, message: "No se pudo leer la lista de presupuestos ocultos." }, 400);
  }

  const input = (payload as { dealIds?: unknown }).dealIds ?? payload;
  const dealIds = sanitizeNumberList(input);

  await writeSharedState(SHARED_STATE_KEYS.hiddenDeals, dealIds);
  return c.json({ ok: true, dealIds, updatedAt: new Date().toISOString() });
});

app.get("/deal-extras", async (c) => {
  const url = new URL(c.req.url);
  const dealIdParam = url.searchParams.get("dealId");

  if (!dealIdParam) {
    return c.json({ dealId: null, extras: { notes: [], documents: [] }, message: "Debes indicar el identificador del presupuesto." }, 400);
  }

  const dealId = Number.parseInt(dealIdParam, 10);

  if (!Number.isFinite(dealId)) {
    return c.json({ dealId: null, extras: { notes: [], documents: [] }, message: "El identificador de presupuesto no es válido." }, 400);
  }

  const storage = await readSharedState<Record<string, unknown>>(SHARED_STATE_KEYS.dealExtras, {});
  const extras = sanitizeSharedExtras(storage[String(dealId)]);
  return c.json({ dealId, extras });
});

app.put("/deal-extras", async (c) => {
  const url = new URL(c.req.url);
  const dealIdParam = url.searchParams.get("dealId");

  if (!dealIdParam) {
    return c.json({ ok: false, message: "Debes indicar el identificador del presupuesto." }, 400);
  }

  const dealId = Number.parseInt(dealIdParam, 10);

  if (!Number.isFinite(dealId)) {
    return c.json({ ok: false, message: "El identificador del presupuesto no es válido." }, 400);
  }

  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch (error) {
    console.error("No se pudo leer el cuerpo de la solicitud de extras", error);
    return c.json({ ok: false, message: "No se pudieron leer los datos adicionales del presupuesto." }, 400);
  }

  const extras = sanitizeSharedExtras(payload);
  const storage = await readSharedState<Record<string, unknown>>(SHARED_STATE_KEYS.dealExtras, {});
  const updated = { ...storage, [String(dealId)]: extras };
  await writeSharedState(SHARED_STATE_KEYS.dealExtras, updated);

  return c.json({ ok: true, dealId, extras, updatedAt: new Date().toISOString() });
});

// Health
app.get("/health", (c) => c.json({ ok: true, at: new Date().toISOString() }));

// Listado y detalle de deals (persistidos en BD)
app.get("/deals", async (c) => {
  const url = new URL(c.req.url);
  const dealIdParam = url.searchParams.get("dealId");
  const refreshParam = url.searchParams.get("refresh");
  const forceRefresh = parseBooleanFlag(refreshParam);

  if (dealIdParam) {
    const dealId = Number.parseInt(dealIdParam, 10);

    if (!Number.isFinite(dealId)) {
      return c.json({ deal: null, message: "El identificador de presupuesto no es válido." }, 400);
    }

    const storedDeal = await readStoredDeal(dealId);

    if (!forceRefresh && storedDeal) {
      return c.json({ deal: storedDeal, refreshed: false });
    }

    try {
      const rawDeal = await getDealById(dealId);

      if (!rawDeal) {
        await deleteStoredDeal(dealId);
        return c.json(
          { deal: null, message: "No se encontró el presupuesto solicitado." },
          404
        );
      }

      if (typeof rawDeal !== "object" || rawDeal === null) {
        throw new Error("Respuesta inesperada de Pipedrive al obtener un presupuesto");
      }

      let fieldOptions: SingleOptionFieldOptions = {};

      try {
        fieldOptions = await loadDealFieldOptions();
      } catch (error) {
        console.error("No se pudieron cargar los metadatos de campos de Pipedrive", error);
        fieldOptions = {};
      }

      const deal = mapPipedriveDealToRecord(
        rawDeal as Record<string, unknown>,
        fieldOptions
      );
      await saveDealRecord(deal);
      return c.json({ deal, refreshed: true });
    } catch (error) {
      console.error(`Error al consultar el deal ${dealId} en Pipedrive`, error);

      if (storedDeal) {
        return c.json({
          deal: storedDeal,
          refreshed: false,
          message: "Se devolvió la versión almacenada del presupuesto porque no se pudo actualizar desde Pipedrive."
        });
      }

      return c.json(
        { deal: null, message: "No se pudo obtener el presupuesto desde Pipedrive." },
        502
      );
    }
  }

  let deals = await listStoredDeals();

  if (forceRefresh || deals.length === 0) {
    await synchronizeDealsFromPipedrive({ force: forceRefresh, knownDeals: deals });
    deals = await listStoredDeals();
  }

  return c.json({ deals, page: 1, limit: deals.length });
});

app.put("/deals", async (c) => {
  let payload: unknown;

  try {
    payload = await c.req.json();
  } catch (error) {
    console.error("No se pudo leer el cuerpo de la solicitud de actualización de deal", error);
    return c.json({ ok: false, message: "No se pudo leer la información del presupuesto." }, 400);
  }

  const input = (payload as { deal?: unknown }).deal ?? payload;
  const deal = sanitizeStoredDealRecord(input);

  if (!deal) {
    return c.json({ ok: false, message: "Los datos del presupuesto no son válidos." }, 400);
  }

  await saveDealRecord(deal);
  return c.json({ ok: true, deal, updatedAt: new Date().toISOString() });
});

app.delete("/deals", async (c) => {
  const url = new URL(c.req.url);
  const dealIdParam = url.searchParams.get("dealId");

  if (!dealIdParam) {
    return c.json({ ok: false, message: "Debes indicar el identificador del presupuesto." }, 400);
  }

  const dealId = Number.parseInt(dealIdParam, 10);

  if (!Number.isFinite(dealId)) {
    return c.json({ ok: false, message: "El identificador del presupuesto no es válido." }, 400);
  }

  const existingDeal = await readStoredDeal(dealId);
  const removed = await deleteStoredDeal(dealId);

  if (!removed && !existingDeal) {
    return c.json({ ok: false, message: "No se encontró el presupuesto indicado." }, 404);
  }

  return c.json({ ok: true, dealId, removedAt: new Date().toISOString() });
});

// Handler manual (evita el adapter y problemas de path)
export const handler: Handler = async (event) => {
  const host = event.headers["x-forwarded-host"] || event.headers["host"] || "localhost";
  const scheme = event.headers["x-forwarded-proto"] || "http";
  const path = event.path || "/.netlify/functions/api";
  const query = event.rawQuery
    ? `?${event.rawQuery}`
    : event.queryStringParameters
    ? `?${new URLSearchParams(event.queryStringParameters as Record<string, string>).toString()}`
    : "";
  const url = `${scheme}://${host}${path}${query}`;

  const req = new Request(url, {
    method: event.httpMethod,
    headers: event.headers as any,
    body:
      event.body && !["GET", "HEAD"].includes(event.httpMethod)
        ? event.isBase64Encoded
          ? Buffer.from(event.body, "base64")
          : event.body
        : undefined
  });

  const res = await app.fetch(req);
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => (headers[k] = v));
  const body = await res.text();
  return { statusCode: res.status, headers, body };
};
