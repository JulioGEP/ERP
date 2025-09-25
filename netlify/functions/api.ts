// --- BEGIN: Index setup guard ---
const SHOULD_SETUP_INDEXES =
  (process.env.ENABLE_DB_INDEX_SETUP ?? "").toLowerCase() === "true";

async function setupPipedriveIndexesIfEnabled(db: ReturnType<typeof drizzle> | null) {
  if (!db || !SHOULD_SETUP_INDEXES) return;
  const statements = [
    "create unique index if not exists organizations_pipedrive_id_key on organizations(pipedrive_id)",
    "create unique index if not exists persons_pipedrive_id_key on persons(pipedrive_id)",
    "create unique index if not exists deals_pipedrive_id_key on deals(pipedrive_id)",
    "create unique index if not exists notes_pipedrive_id_key on notes(pipedrive_id)",
    "create unique index if not exists documents_pipedrive_id_key on documents(pipedrive_id)"
  ];
  for (const s of statements) {
    try {
      await db.execute(sql.raw(s));
    } catch (err) {
      const msg = (err as any)?.message ?? "";
      if (typeof msg === "string" && msg.toLowerCase().includes("already exists")) {
        console.info("Índice ya existe:", s);
      } else {
        console.error("Error creando índice:", s, err);
      }
    }
  }
}
// --- END: Index setup guard ---
import type { Handler } from "@netlify/functions";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq, inArray, sql } from "drizzle-orm";
import {
  dealAttachments,
  dealFormations,
  dealNotes,
  dealProducts,
  deals,
  sharedState
} from "../../db/schema";
import {
  getDealById,
  listDealFields,
  listDealsUpdatedDesc,
  listPipelines
} from "../../adapters/pipedrive";

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

const PIPELINE_NAME: Record<string | number, string> = {
  1: "Formación",
  2: "Consultoría"
};

type RelatedEntity = {
  id: number | null;
  name: string | null;
  address: string | null;
};

class DatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseError";
  }
}

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

const SHARED_STATE_PERSISTENCE_ENABLED = (() => {
  const flag = process.env.ENABLE_SHARED_STATE_PERSISTENCE ?? process.env.SYNC_SHARED_STATE_TO_DATABASE;

  if (typeof flag !== "string") {
    return false;
  }

  const normalised = flag.trim().toLowerCase();
  return normalised === "1" || normalised === "true" || normalised === "yes" || normalised === "si";
})();

type SharedStateEntry = {
  value: unknown;
  updatedAt: string;
};

const inMemorySharedState = new Map<string, SharedStateEntry>();

let sharedStateTablePromise: Promise<void> | null = null;
let pipedriveIndexPromise: Promise<void> | null = null;

const PIPEDRIVE_INDEX_QUERIES = [
  "create unique index if not exists organizations_pipedrive_id_key on organizations(pipedrive_id)",
  "create unique index if not exists persons_pipedrive_id_key on persons(pipedrive_id)",
  "create unique index if not exists deals_pipedrive_id_key on deals(pipedrive_id)",
  "create unique index if not exists notes_pipedrive_id_key on notes(pipedrive_id)",
  "create unique index if not exists documents_pipedrive_id_key on documents(pipedrive_id)"
];

const ensurePipedriveIndexes = async (): Promise<void> => {
  if (!db) {
    return;
  }

  if (!pipedriveIndexPromise) {
    pipedriveIndexPromise = (async () => {
      for (const statement of PIPEDRIVE_INDEX_QUERIES) {
        try {
          await db.execute(sql.raw(statement));
        } catch (error) {
          const message =
            typeof (error as { message?: unknown })?.message === "string"
              ? ((error as { message?: unknown }).message as string)
              : "";
          if (!message.toLowerCase().includes("already exists")) {
            console.error("No se pudieron asegurar los índices únicos para pipedrive_id", {
              statement,
              error
            });
            throw error;
          }
        }
      }
    })();
  }

  try {
    await pipedriveIndexPromise;
  } catch (error) {
    pipedriveIndexPromise = null;
    throw error;
  }
};

iif (db) {
  setupPipedriveIndexesIfEnabled(db).catch((e) =>
    console.error("No se pudieron preparar los índices de pipedrive_id", e)
  );
}

const ensureSharedStateTable = async (): Promise<boolean> => {
  if (!db || !SHARED_STATE_PERSISTENCE_ENABLED) {
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
  if (!db || !SHARED_STATE_PERSISTENCE_ENABLED) {
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

  const entry: SharedStateEntry = { value: serializedValue, updatedAt: new Date().toISOString() };
  inMemorySharedState.set(key, entry);

  if (!db || !SHARED_STATE_PERSISTENCE_ENABLED) {
    return;
  }

  const ensured = await ensureSharedStateTable();
  if (!ensured) {
    return;
  }

  try {
    const now = new Date(entry.updatedAt);
    await db
      .insert(sharedState)
      .values({ key, value: serializedValue as any, updatedAt: now })
      .onConflictDoUpdate({
        target: sharedState.key,
        set: { value: serializedValue as any, updatedAt: now }
      });
  } catch (error) {
    console.error(`No se pudo guardar el estado compartido para ${key}`, error);
  }
};

let dealStorageSetupPromise: Promise<void> | null = null;

const verifyDealStorageTables = async (): Promise<boolean> => {
  if (!db) {
    return false;
  }

  const checks: Array<{ name: string; verify: () => Promise<unknown> }> = [
    { name: "deals", verify: () => db.select({ id: deals.id }).from(deals).limit(1) },
    {
      name: "deal_formations",
      verify: () => db.select({ id: dealFormations.id }).from(dealFormations).limit(1)
    },
    {
      name: "deal_products",
      verify: () => db.select({ id: dealProducts.dealProductId }).from(dealProducts).limit(1)
    },
    {
      name: "deal_notes",
      verify: () => db.select({ id: dealNotes.noteId }).from(dealNotes).limit(1)
    },
    {
      name: "deal_attachments",
      verify: () => db.select({ id: dealAttachments.attachmentId }).from(dealAttachments).limit(1)
    }
  ];

  for (const { name, verify } of checks) {
    try {
      await verify();
    } catch (error) {
      console.error(`No se pudo verificar la existencia de la tabla ${name}`, error);
      return false;
    }
  }

  return true;
};

const ensureDealStorageTables = async (): Promise<boolean> => {
  if (!db) {
    return false;
  }

  if (!dealStorageSetupPromise) {
    dealStorageSetupPromise = (async () => {
      try {
        await db.execute(sql`
          create table if not exists deals (
            id bigserial primary key,
            title text not null,
            client_id integer,
            client_name text,
            sede text,
            address text,
            caes text,
            fundae text,
            hotel_pernocta text,
            pipeline_id integer,
            pipeline_name text,
            won_date text,
            created_at timestamptz default now() not null,
            updated_at timestamptz default now() not null
          )
        `);

        await db.execute(sql`
          create table if not exists deal_formations (
            id serial primary key,
            deal_id bigint references deals(id) on delete cascade,
            value text not null,
            position integer not null default 0,
            created_at timestamptz default now() not null
          )
        `);

        await db.execute(sql`
          create table if not exists deal_products (
            deal_product_id integer primary key,
            deal_id bigint references deals(id) on delete cascade,
            product_id integer,
            name text not null,
            code text,
            quantity double precision,
            item_price double precision,
            recommended_hours double precision,
            recommended_hours_raw text,
            is_training boolean not null default false,
            position integer not null default 0,
            created_at timestamptz default now() not null,
            updated_at timestamptz default now() not null
          )
        `);

        await db.execute(sql`
          create table if not exists deal_notes (
            note_id varchar(255) primary key,
            deal_id bigint references deals(id) on delete cascade,
            content text not null,
            created_at_text text,
            author_name text,
            source varchar(32) not null default 'deal',
            product_id integer,
            deal_product_id integer,
            position integer not null default 0,
            product_position integer,
            created_at timestamptz default now() not null
          )
        `);

        await db.execute(sql`
          create table if not exists deal_attachments (
            attachment_id varchar(255) primary key,
            deal_id bigint references deals(id) on delete cascade,
            name text not null,
            url text not null,
            download_url text,
            file_type text,
            added_at_text text,
            added_by text,
            source varchar(32) not null default 'deal',
            product_id integer,
            deal_product_id integer,
            position integer not null default 0,
            product_position integer,
            created_at timestamptz default now() not null
          )
        `);
      } catch (error) {
        console.error("No se pudieron inicializar las tablas de deals", error);

        const verified = await verifyDealStorageTables();
        if (!verified) {
          throw error;
        }
      }
    })();
  }

  try {
    await dealStorageSetupPromise;
    return true;
  } catch (error) {
    console.error("Fallo al comprobar las tablas de deals", error);
    dealStorageSetupPromise = null;
    return false;
  }
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

type StoredDealRow = {
  dealId: number;
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
  updatedAt: Date | null;
};

type StoredFormationRow = {
  dealId: number | null;
  value: string | null;
  position: number | null;
};

type StoredProductRow = {
  dealId: number | null;
  dealProductId: number | null;
  productId: number | null;
  name: string | null;
  code: string | null;
  quantity: number | null;
  itemPrice: number | null;
  recommendedHours: number | null;
  recommendedHoursRaw: string | null;
  isTraining: boolean | null;
  position: number | null;
};

type StoredNoteRow = {
  noteId: string | null;
  dealId: number | null;
  content: string | null;
  createdAtText: string | null;
  authorName: string | null;
  source: string | null;
  productId: number | null;
  dealProductId: number | null;
  position: number | null;
  productPosition: number | null;
};

type StoredAttachmentRow = {
  attachmentId: string | null;
  dealId: number | null;
  name: string | null;
  url: string | null;
  downloadUrl: string | null;
  fileType: string | null;
  addedAtText: string | null;
  addedBy: string | null;
  source: string | null;
  productId: number | null;
  dealProductId: number | null;
  position: number | null;
  productPosition: number | null;
};

const loadDealsFromDatabase = async (
  options: { dealIds?: number[] } = {}
): Promise<DealRecord[]> => {
  if (!db) {
    const message = "No hay conexión con la base de datos; no se pudieron leer los presupuestos.";
    console.error(message);
    throw new DatabaseError(message);
  }

  const ensured = await ensureDealStorageTables();
  if (!ensured) {
    const message = "No se pudieron preparar las tablas de presupuestos en la base de datos.";
    console.error(message);
    throw new DatabaseError(message);
  }

  const { dealIds } = options;

  try {
    const filterClause = dealIds && dealIds.length > 0
      ? sql`where d.id in (${sql.join(dealIds.map((id) => sql`${id}`), sql`, `)})`
      : sql``;

    const baseResult = await db.execute(sql`
      select
        d.id,
        d.pipedrive_id,
        d.org_id as client_id,
        o.name as client_name,
        d.site as sede,
        d.deal_direction as address,
        d.caes,
        d.fundae,
        d.hotel_night as hotel_pernocta,
        d.pipeline_id,
        d.training,
        d.prod_extra,
        d.hours,
        d.status,
        d.updated_at
      from deals d
      left join organizations o on o.id = d.org_id
      ${filterClause}
      order by d.updated_at desc, d.id desc
    `);

    const baseRows: StoredDealRow[] = [];

    const parseNumeric = (value: unknown): number | null => {
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }

      if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : null;
      }

      if (typeof value === "bigint") {
        return Number(value);
      }

      return null;
    };

    const parseString = (value: unknown): string | null => {
      if (typeof value !== "string") {
        return null;
      }

      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    const parseDate = (value: unknown): Date | null => {
      if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
      }

      if (typeof value === "string") {
        const timestamp = Date.parse(value);
        return Number.isNaN(timestamp) ? null : new Date(timestamp);
      }

      return null;
    };

    (baseResult.rows as Record<string, unknown>[]).forEach((row) => {

      const dealId = parseNumeric(row.id);
      if (dealId === null) {
        return;
      }
      const pipelineId = parseNumeric(row.pipeline_id);
      const titleRaw = row.title;

      baseRows.push({
        dealId,
        title:
          typeof titleRaw === "string" && titleRaw.trim().length > 0
            ? titleRaw
            : `Presupuesto #${dealId}`,
        clientId: parseNumeric(row.client_id),
        clientName: parseString(row.client_name),
        sede: parseString(row.sede),
        address: parseString(row.address),
        caes: parseString(row.caes),
        fundae: parseString(row.fundae),
        hotelPernocta: parseString(row.hotel_pernocta),
        pipelineId,
        pipelineName: pipelineId !== null ? PIPELINE_NAME[pipelineId] ?? null : null,
        wonDate: null,
        updatedAt: parseDate(row.updated_at)
      });
    });

    if (baseRows.length === 0) {
      return [];
    }

    const identifiers = baseRows
      .map((row) => row.dealId)
      .filter((value): value is number => typeof value === "number");

    if (identifiers.length === 0) {
      return [];
    }

    const builders = new Map<
      number,
      {
        base: StoredDealRow;
        formations: { value: string; position: number }[];
        productContainers: Map<
          number,
          {
            product: DealProduct;
            position: number;
            noteEntries: { note: DealNote; position: number }[];
            attachmentEntries: { attachment: DealAttachment; position: number }[];
          }
        >;
        trainingProducts: { product: DealProduct; position: number }[];
        extraProducts: { product: DealProduct; position: number }[];
        notes: { note: DealNote; position: number }[];
        attachments: { attachment: DealAttachment; position: number }[];
      }
    >();

    baseRows.forEach((row) => {
      builders.set(row.dealId, {
        base: row,
        formations: [],
        productContainers: new Map(),
        trainingProducts: [],
        extraProducts: [],
        notes: [],
        attachments: []
      });
    });

    const formationRows = await db
      .select({
        dealId: dealFormations.dealId,
        value: dealFormations.value,
        position: dealFormations.position
      })
      .from(dealFormations)
      .where(inArray(dealFormations.dealId, identifiers))
      .orderBy(dealFormations.dealId, dealFormations.position, dealFormations.id);

    formationRows.forEach((row: StoredFormationRow) => {
      if (typeof row.dealId !== "number" || typeof row.value !== "string") {
        return;
      }

      const builder = builders.get(row.dealId);
      if (!builder) {
        return;
      }

      builder.formations.push({ value: row.value, position: row.position ?? 0 });
    });

    const productRows = await db
      .select({
        dealId: dealProducts.dealId,
        dealProductId: dealProducts.dealProductId,
        productId: dealProducts.productId,
        name: dealProducts.name,
        code: dealProducts.code,
        quantity: dealProducts.quantity,
        itemPrice: dealProducts.itemPrice,
        recommendedHours: dealProducts.recommendedHours,
        recommendedHoursRaw: dealProducts.recommendedHoursRaw,
        isTraining: dealProducts.isTraining,
        position: dealProducts.position
      })
      .from(dealProducts)
      .where(inArray(dealProducts.dealId, identifiers))
      .orderBy(dealProducts.dealId, dealProducts.position, dealProducts.dealProductId);

    productRows.forEach((row: StoredProductRow) => {
      if (typeof row.dealId !== "number" || typeof row.dealProductId !== "number") {
        return;
      }

      const builder = builders.get(row.dealId);
      if (!builder) {
        return;
      }

      const product: DealProduct = {
        dealProductId: row.dealProductId,
        productId: row.productId ?? null,
        name: row.name ?? `Producto ${row.dealProductId}`,
        code: row.code ?? null,
        quantity: typeof row.quantity === "number" && Number.isFinite(row.quantity) ? row.quantity : 0,
        itemPrice: row.itemPrice ?? null,
        recommendedHours: row.recommendedHours ?? null,
        recommendedHoursRaw: row.recommendedHoursRaw ?? null,
        notes: [],
        attachments: [],
        isTraining: Boolean(row.isTraining)
      };

      const container = {
        product,
        position: row.position ?? 0,
        noteEntries: [] as { note: DealNote; position: number }[],
        attachmentEntries: [] as { attachment: DealAttachment; position: number }[]
      };

      builder.productContainers.set(row.dealProductId, container);

      if (product.isTraining) {
        builder.trainingProducts.push({ product, position: container.position });
      } else {
        builder.extraProducts.push({ product, position: container.position });
      }
    });

    const noteRows = await db
      .select({
        noteId: dealNotes.noteId,
        dealId: dealNotes.dealId,
        content: dealNotes.content,
        createdAtText: dealNotes.createdAtText,
        authorName: dealNotes.authorName,
        source: dealNotes.source,
        productId: dealNotes.productId,
        dealProductId: dealNotes.dealProductId,
        position: dealNotes.position,
        productPosition: dealNotes.productPosition
      })
      .from(dealNotes)
      .where(inArray(dealNotes.dealId, identifiers))
      .orderBy(dealNotes.dealId, dealNotes.position, dealNotes.noteId);

    noteRows.forEach((row: StoredNoteRow) => {
      if (typeof row.dealId !== "number" || typeof row.noteId !== "string" || typeof row.content !== "string") {
        return;
      }

      const builder = builders.get(row.dealId);
      if (!builder) {
        return;
      }

      const note: DealNote = {
        id: row.noteId,
        content: row.content,
        createdAt: row.createdAtText ?? null,
        authorName: row.authorName ?? null,
        source: row.source === "product" || row.source === "local" ? row.source : "deal",
        productId: row.productId ?? null,
        dealProductId: row.dealProductId ?? null
      };

      builder.notes.push({ note, position: row.position ?? 0 });

      if (typeof row.dealProductId === "number") {
        const container = builder.productContainers.get(row.dealProductId);
        if (container) {
          container.noteEntries.push({ note, position: row.productPosition ?? row.position ?? 0 });
        }
      }
    });

    const attachmentRows = await db
      .select({
        attachmentId: dealAttachments.attachmentId,
        dealId: dealAttachments.dealId,
        name: dealAttachments.name,
        url: dealAttachments.url,
        downloadUrl: dealAttachments.downloadUrl,
        fileType: dealAttachments.fileType,
        addedAtText: dealAttachments.addedAtText,
        addedBy: dealAttachments.addedBy,
        source: dealAttachments.source,
        productId: dealAttachments.productId,
        dealProductId: dealAttachments.dealProductId,
        position: dealAttachments.position,
        productPosition: dealAttachments.productPosition
      })
      .from(dealAttachments)
      .where(inArray(dealAttachments.dealId, identifiers))
      .orderBy(dealAttachments.dealId, dealAttachments.position, dealAttachments.attachmentId);

    attachmentRows.forEach((row: StoredAttachmentRow) => {
      if (
        typeof row.dealId !== "number" ||
        typeof row.attachmentId !== "string" ||
        typeof row.name !== "string" ||
        typeof row.url !== "string"
      ) {
        return;
      }

      const builder = builders.get(row.dealId);
      if (!builder) {
        return;
      }

      const attachment: DealAttachment = {
        id: row.attachmentId,
        name: row.name,
        url: row.url,
        downloadUrl: row.downloadUrl ?? null,
        fileType: row.fileType ?? null,
        addedAt: row.addedAtText ?? null,
        addedBy: row.addedBy ?? null,
        source: row.source === "product" || row.source === "local" ? row.source : "deal",
        productId: row.productId ?? null,
        dealProductId: row.dealProductId ?? null
      };

      builder.attachments.push({ attachment, position: row.position ?? 0 });

      if (typeof row.dealProductId === "number") {
        const container = builder.productContainers.get(row.dealProductId);
        if (container) {
          container.attachmentEntries.push({ attachment, position: row.productPosition ?? row.position ?? 0 });
        }
      }
    });

    const results: DealRecord[] = [];

    baseRows.forEach((row) => {
      const builder = builders.get(row.dealId);
      if (!builder) {
        return;
      }

      const formations = builder.formations
        .sort((a, b) => a.position - b.position)
        .map((entry) => entry.value)
        .filter((value): value is string => typeof value === "string");

      builder.productContainers.forEach((container) => {
        container.noteEntries.sort((a, b) => a.position - b.position);
        container.product.notes = container.noteEntries.map((entry) => entry.note);

        container.attachmentEntries.sort((a, b) => a.position - b.position);
        container.product.attachments = container.attachmentEntries.map((entry) => entry.attachment);
      });

      const trainingProducts = builder.trainingProducts
        .sort((a, b) => a.position - b.position)
        .map((entry) => entry.product);

      const extraProducts = builder.extraProducts
        .sort((a, b) => a.position - b.position)
        .map((entry) => entry.product);

      const notes = builder.notes
        .sort((a, b) => a.position - b.position)
        .map((entry) => entry.note);

      const attachments = builder.attachments
        .sort((a, b) => a.position - b.position)
        .map((entry) => entry.attachment);

      const record: DealRecord = {
        id: row.dealId,
        title: row.title,
        clientId: row.clientId ?? null,
        clientName: row.clientName ?? null,
        sede: row.sede ?? null,
        address: row.address ?? null,
        caes: row.caes ?? null,
        fundae: row.fundae ?? null,
        hotelPernocta: row.hotelPernocta ?? null,
        pipelineId: row.pipelineId ?? null,
        pipelineName: row.pipelineName ?? null,
        wonDate: row.wonDate ?? null,
        formations,
        trainingProducts,
        extraProducts,
        notes,
        attachments
      };

      results.push(record);
    });

    return results;
  } catch (error) {
    const message = "No se pudieron leer los presupuestos desde la base de datos.";
    console.error(message, error);
    throw new DatabaseError(message);
  }
};
const readStoredDeal = async (dealId: number): Promise<DealRecord | null> => {
  if (!Number.isFinite(dealId)) {
    return null;
  }

  try {
    const [deal] = await loadDealsFromDatabase({ dealIds: [dealId] });
    return deal ?? null;
  } catch (error) {
    if (error instanceof DatabaseError) {
      throw error;
    }

    const message = `No se pudo leer el presupuesto ${dealId} desde la base de datos.`;
    console.error(message, error);
    throw new DatabaseError(message);
  }
};

const listStoredDeals = async (): Promise<DealRecord[]> => {
  try {
    return await loadDealsFromDatabase();
  } catch (error) {
    if (error instanceof DatabaseError) {
      throw error;
    }

    const message = "No se pudo leer la lista de presupuestos desde la base de datos.";
    console.error(message, error);
    throw new DatabaseError(message);
  }
};

const saveDealRecord = async (deal: DealRecord): Promise<void> => {
  if (!db) {
    const message = "No hay conexión con la base de datos; no se pudo guardar el presupuesto.";
    console.error(message);
    throw new DatabaseError(message);
  }

  const ensured = await ensureDealStorageTables();
  if (!ensured) {
    const message = "No se pudieron preparar las tablas de presupuestos en la base de datos.";
    console.error(message);
    throw new DatabaseError(message);
  }

  const now = new Date();

  const productNotePositions = new Map<string, number>();
  const productAttachmentPositions = new Map<string, number>();

  const registerProductDetails = (products: DealProduct[]) => {
    products.forEach((product) => {
      product.notes.forEach((note, index) => {
        productNotePositions.set(note.id, index);
      });
      product.attachments.forEach((attachment, index) => {
        productAttachmentPositions.set(attachment.id, index);
      });
    });
  };

  registerProductDetails(deal.trainingProducts);
  registerProductDetails(deal.extraProducts);

  const productMap = new Map<
    number,
    {
      productId: number | null;
      name: string;
      code: string | null;
      quantity: number;
      itemPrice: number | null;
      recommendedHours: number | null;
      recommendedHoursRaw: string | null;
      isTraining: boolean;
      position: number;
    }
  >();

  const registerProduct = (products: DealProduct[], isTrainingCategory: boolean) => {
    products.forEach((product, index) => {
      const existing = productMap.get(product.dealProductId);
      if (existing) {
        existing.productId = existing.productId ?? product.productId ?? null;
        if (!existing.name) {
          existing.name = product.name;
        }
        existing.code = existing.code ?? product.code ?? null;
        if (!Number.isFinite(existing.quantity) || existing.quantity === 0) {
          existing.quantity = product.quantity ?? 0;
        }
        existing.itemPrice = existing.itemPrice ?? product.itemPrice ?? null;
        existing.recommendedHours = existing.recommendedHours ?? product.recommendedHours ?? null;
        existing.recommendedHoursRaw =
          existing.recommendedHoursRaw ?? product.recommendedHoursRaw ?? null;
        const resolvedTraining = existing.isTraining || product.isTraining || isTrainingCategory;
        existing.isTraining = resolvedTraining;
        if (resolvedTraining) {
          if (isTrainingCategory) {
            existing.position = index;
          }
        } else {
          existing.position = index;
        }
      } else {
        const resolvedTraining = product.isTraining || isTrainingCategory;
        productMap.set(product.dealProductId, {
          productId: product.productId ?? null,
          name: product.name,
          code: product.code ?? null,
          quantity: product.quantity ?? 0,
          itemPrice: product.itemPrice ?? null,
          recommendedHours: product.recommendedHours ?? null,
          recommendedHoursRaw: product.recommendedHoursRaw ?? null,
          isTraining: resolvedTraining,
          position: index
        });
      }
    });
  };

  registerProduct(deal.trainingProducts, true);
  registerProduct(deal.extraProducts, false);

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(deals)
        .values({
          id: deal.id,
          title: deal.title,
          clientId: deal.clientId ?? null,
          clientName: deal.clientName ?? null,
          sede: deal.sede ?? null,
          address: deal.address ?? null,
          caes: deal.caes ?? null,
          fundae: deal.fundae ?? null,
          hotelPernocta: deal.hotelPernocta ?? null,
          pipelineId: deal.pipelineId ?? null,
          pipelineName: deal.pipelineName ?? null,
          wonDate: deal.wonDate ?? null,
          updatedAt: now
        })
        .onConflictDoUpdate({
          target: deals.id,
          set: {
            title: deal.title,
            clientId: deal.clientId ?? null,
            clientName: deal.clientName ?? null,
            sede: deal.sede ?? null,
            address: deal.address ?? null,
            caes: deal.caes ?? null,
            fundae: deal.fundae ?? null,
            hotelPernocta: deal.hotelPernocta ?? null,
            pipelineId: deal.pipelineId ?? null,
            pipelineName: deal.pipelineName ?? null,
            wonDate: deal.wonDate ?? null,
            updatedAt: now
          }
        });

      await tx.delete(dealFormations).where(eq(dealFormations.dealId, deal.id));
      if (deal.formations.length > 0) {
        await tx.insert(dealFormations).values(
          deal.formations.map((value, index) => ({
            dealId: deal.id,
            value,
            position: index
          }))
        );
      }

      await tx.delete(dealProducts).where(eq(dealProducts.dealId, deal.id));
      if (productMap.size > 0) {
        await tx
          .insert(dealProducts)
          .values(
            Array.from(productMap.entries()).map(([dealProductId, entry]) => ({
              dealProductId,
              dealId: deal.id,
              productId: entry.productId ?? null,
              name: entry.name,
              code: entry.code ?? null,
              quantity: entry.quantity,
              itemPrice: entry.itemPrice ?? null,
              recommendedHours: entry.recommendedHours ?? null,
              recommendedHoursRaw: entry.recommendedHoursRaw ?? null,
              isTraining: entry.isTraining,
              position: entry.position,
              updatedAt: now
            }))
          )
          .onConflictDoUpdate({
            target: dealProducts.dealProductId,
            set: {
              dealId: sql`excluded.deal_id`,
              productId: sql`excluded.product_id`,
              name: sql`excluded.name`,
              code: sql`excluded.code`,
              quantity: sql`excluded.quantity`,
              itemPrice: sql`excluded.item_price`,
              recommendedHours: sql`excluded.recommended_hours`,
              recommendedHoursRaw: sql`excluded.recommended_hours_raw`,
              isTraining: sql`excluded.is_training`,
              position: sql`excluded.position`,
              updatedAt: sql`excluded.updated_at`
            }
          });
      }

      await tx.delete(dealNotes).where(eq(dealNotes.dealId, deal.id));
      if (deal.notes.length > 0) {
        await tx
          .insert(dealNotes)
          .values(
            deal.notes.map((note, index) => ({
              noteId: note.id,
              dealId: deal.id,
              content: note.content,
              createdAtText: note.createdAt ?? null,
              authorName: note.authorName ?? null,
              source: note.source,
              productId: note.productId ?? null,
              dealProductId: note.dealProductId ?? null,
              position: index,
              productPosition: productNotePositions.get(note.id) ?? null
            }))
          )
          .onConflictDoUpdate({
            target: dealNotes.noteId,
            set: {
              dealId: sql`excluded.deal_id`,
              content: sql`excluded.content`,
              createdAtText: sql`excluded.created_at_text`,
              authorName: sql`excluded.author_name`,
              source: sql`excluded.source`,
              productId: sql`excluded.product_id`,
              dealProductId: sql`excluded.deal_product_id`,
              position: sql`excluded.position`,
              productPosition: sql`excluded.product_position`
            }
          });
      }

      await tx.delete(dealAttachments).where(eq(dealAttachments.dealId, deal.id));
      if (deal.attachments.length > 0) {
        await tx
          .insert(dealAttachments)
          .values(
            deal.attachments.map((attachment, index) => ({
              attachmentId: attachment.id,
              dealId: deal.id,
              name: attachment.name,
              url: attachment.url,
              downloadUrl: attachment.downloadUrl ?? null,
              fileType: attachment.fileType ?? null,
              addedAtText: attachment.addedAt ?? null,
              addedBy: attachment.addedBy ?? null,
              source: attachment.source,
              productId: attachment.productId ?? null,
              dealProductId: attachment.dealProductId ?? null,
              position: index,
              productPosition: productAttachmentPositions.get(attachment.id) ?? null
            }))
          )
          .onConflictDoUpdate({
            target: dealAttachments.attachmentId,
            set: {
              dealId: sql`excluded.deal_id`,
              name: sql`excluded.name`,
              url: sql`excluded.url`,
              downloadUrl: sql`excluded.download_url`,
              fileType: sql`excluded.file_type`,
              addedAtText: sql`excluded.added_at_text`,
              addedBy: sql`excluded.added_by`,
              source: sql`excluded.source`,
              productId: sql`excluded.product_id`,
              dealProductId: sql`excluded.deal_product_id`,
              position: sql`excluded.position`,
              productPosition: sql`excluded.product_position`
            }
          });
      }
    });
  } catch (error) {
    const message = `No se pudo guardar el presupuesto ${deal.id} en la base de datos.`;
    console.error(message, error);
    throw new DatabaseError(message);
  }
};

const extractDealIdentifier = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const removeDealReferencesFromSharedState = async (dealId: number): Promise<void> => {
  const manualDeals = await readSharedState<unknown[]>(SHARED_STATE_KEYS.manualDeals, []);
  const filteredManualDeals = manualDeals.filter((entry) => {
    if (!entry || typeof entry !== "object") {
      return true;
    }

    const candidate = extractDealIdentifier((entry as { id?: unknown }).id);
    return candidate !== dealId;
  });

  if (filteredManualDeals.length !== manualDeals.length) {
    await writeSharedState(SHARED_STATE_KEYS.manualDeals, filteredManualDeals);
  }

  const hiddenDealCandidates = await readSharedState<unknown[]>(SHARED_STATE_KEYS.hiddenDeals, []);
  const hiddenDealIds = Array.isArray(hiddenDealCandidates)
    ? hiddenDealCandidates
        .map((value) => extractDealIdentifier(value))
        .filter((value): value is number => value !== null)
    : [];
  const filteredHiddenDealIds = hiddenDealIds.filter((hiddenDealId) => hiddenDealId !== dealId);

  if (filteredHiddenDealIds.length !== hiddenDealIds.length) {
    await writeSharedState(SHARED_STATE_KEYS.hiddenDeals, filteredHiddenDealIds);
  }

  const events = await readSharedState<unknown[]>(SHARED_STATE_KEYS.calendarEvents, []);
  const filteredEvents = events.filter((event) => {
    if (!event || typeof event !== "object") {
      return true;
    }

    const candidate = extractDealIdentifier((event as { dealId?: unknown }).dealId);
    return candidate !== dealId;
  });

  if (filteredEvents.length !== events.length) {
    await writeSharedState(SHARED_STATE_KEYS.calendarEvents, filteredEvents);
  }

  const extrasStorage = await readSharedState<Record<string, unknown>>(SHARED_STATE_KEYS.dealExtras, {});

  if (Object.prototype.hasOwnProperty.call(extrasStorage, String(dealId))) {
    const { [String(dealId)]: _removed, ...remaining } = extrasStorage;
    await writeSharedState(SHARED_STATE_KEYS.dealExtras, remaining as Record<string, unknown>);
  }
};

const deleteStoredDeal = async (dealId: number): Promise<boolean> => {
  await removeDealReferencesFromSharedState(dealId);

  if (!db) {
    const message = "No hay conexión con la base de datos; no se pudo eliminar el presupuesto.";
    console.error(message);
    throw new DatabaseError(message);
  }

  const ensured = await ensureDealStorageTables();
  if (!ensured) {
    const message = "No se pudieron preparar las tablas de presupuestos en la base de datos.";
    console.error(message);
    throw new DatabaseError(message);
  }

  try {
    const result = await db
      .delete(deals)
      .where(eq(deals.id, dealId))
      .returning({ dealId: deals.id });

    return result.length > 0;
  } catch (error) {
    const message = `No se pudo eliminar el presupuesto ${dealId} de la base de datos.`;
    console.error(message, error);
    throw new DatabaseError(message);
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

const parseDealIdentifier = (value: unknown): number | null => extractDealIdentifier(value);

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

const registerPipelineOptionAliases = (
  options: SingleOptionFieldOptions,
  optionMap: Record<string, string>
) => {
  const identifiers = [
    SINGLE_OPTION_FIELD_IDS.pipelineId,
    "pipelineId",
    "pipeline_id",
    "pipeline id",
    "pipeline",
    "embudo",
    "tipo de formación",
    "tipo formacion",
    "tipo_formacion"
  ];

  identifiers.forEach((identifier) => {
    if (typeof identifier !== "string") {
      return;
    }

    const trimmed = identifier.trim();

    if (trimmed.length === 0) {
      return;
    }

    options[trimmed] = optionMap;
    options[normaliseComparisonText(trimmed)] = optionMap;
  });
};

const fetchDealFieldOptions = async (): Promise<SingleOptionFieldOptions> => {
  const fields = await listDealFields();
  const options = extractSingleOptionFieldOptions(fields);

  const pipelineOptionMap: Record<string, string> =
    options[SINGLE_OPTION_FIELD_IDS.pipelineId] ?? {};

  let shouldRegisterPipelineAliases =
    options[SINGLE_OPTION_FIELD_IDS.pipelineId] !== undefined;

  try {
    const pipelines = await listPipelines();

    pipelines.forEach((pipeline) => {
      if (!pipeline || typeof pipeline !== "object" || Array.isArray(pipeline)) {
        return;
      }

      const record = pipeline as Record<string, unknown>;
      const label =
        toOptionalString(record.name) ??
        toOptionalString(record.label) ??
        toOptionalString(record.title);

      if (!label) {
        return;
      }

      registerDealFieldOptionKey(pipelineOptionMap, record.id, label);
      registerDealFieldOptionKey(pipelineOptionMap, record["pipeline_id"], label);
      registerDealFieldOptionKey(pipelineOptionMap, record["pipelineId"], label);
      registerDealFieldOptionKey(pipelineOptionMap, record["value"], label);
      registerDealFieldOptionKey(pipelineOptionMap, record["key"], label);
    });

    if (Object.keys(pipelineOptionMap).length > 0) {
      options[SINGLE_OPTION_FIELD_IDS.pipelineId] = pipelineOptionMap;
      shouldRegisterPipelineAliases = true;
    }
  } catch (error) {
    console.error("No se pudieron cargar los embudos de Pipedrive", error);
  }

  if (shouldRegisterPipelineAliases && Object.keys(pipelineOptionMap).length > 0) {
    registerPipelineOptionAliases(options, pipelineOptionMap);
  }

  return options;
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

const PIPEDRIVE_RECOMMENDED_HOURS_FIELD = "38f11c8876ecde803a027fbf3c9041fda2ae7eb7";

const parseProductRecommendedHours = (
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

    const match = trimmed.replace(/,/g, ".").match(/\d+(?:\.\d+)?/);
    if (!match) {
      return { numeric: null, raw: null };
    }

    const sanitized = match[0];
    const parsed = Number.parseFloat(sanitized);

    return {
      numeric: Number.isFinite(parsed) ? parsed : null,
      raw: sanitized
    };
  }

  return { numeric: null, raw: null };
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

const resolveDealIdFromRecord = (record: Record<string, unknown>): number | null => {
  const dealIdPaths = [
    "deal_id",
    "dealId",
    "deal.id",
    "dealId.value",
    "deal_id.value",
    "item.deal_id",
    "item.dealId",
    "data.deal_id",
    "data.dealId",
    "related_object.deal_id",
    "related_object.dealId",
    "relatedObjects.deal_id",
    "relatedObjects.dealId"
  ];

  for (const path of dealIdPaths) {
    const candidate = readValueByPath(record, path);
    const parsed = toOptionalNumber(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
};

const parsePipedriveAttachments = (
  value: unknown,
  source: "deal" | "product",
  overrides: { productId: number | null; dealProductId: number | null },
  idPrefix: string,
  options: { expectedDealId?: number | null } = {}
): DealAttachment[] => {
  const result: DealAttachment[] = [];
  const entries = normaliseArray(value);
  const expectedDealId = options.expectedDealId ?? null;

  const shouldIncludeAttachment = (record: Record<string, unknown>): boolean => {
    if (expectedDealId === null) {
      return true;
    }

    const resolvedDealId = resolveDealIdFromRecord(record);
    if (resolvedDealId === null) {
      return false;
    }

    return resolvedDealId === expectedDealId;
  };

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
      if (!shouldIncludeAttachment(record)) {
        return;
      }

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

      const recommendedValue = findFirstValue(candidateRecords, [
        PIPEDRIVE_RECOMMENDED_HOURS_FIELD,
        `product.${PIPEDRIVE_RECOMMENDED_HOURS_FIELD}`,
        `item.${PIPEDRIVE_RECOMMENDED_HOURS_FIELD}`,
        `custom_fields.${PIPEDRIVE_RECOMMENDED_HOURS_FIELD}`,
        `customFields.${PIPEDRIVE_RECOMMENDED_HOURS_FIELD}`,
        `product.custom_fields.${PIPEDRIVE_RECOMMENDED_HOURS_FIELD}`,
        `product.customFields.${PIPEDRIVE_RECOMMENDED_HOURS_FIELD}`,
        `item.custom_fields.${PIPEDRIVE_RECOMMENDED_HOURS_FIELD}`,
        `item.customFields.${PIPEDRIVE_RECOMMENDED_HOURS_FIELD}`
      ]);

      const recommended = parseProductRecommendedHours(recommendedValue);

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
        `${dealId}-${dealProductId}-prod`,
        { expectedDealId: dealId }
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
      `${dealId}`,
      { expectedDealId: dealId }
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

    let storedDeal: DealRecord | null = null;

    let storedDealError: DatabaseError | null = null;

    try {
      storedDeal = await readStoredDeal(dealId);
    } catch (error) {
      if (error instanceof DatabaseError) {
        storedDealError = error;
        console.error("No se pudo acceder al presupuesto almacenado en la base de datos", error);
      } else {
        console.error(`No se pudo leer el presupuesto ${dealId} almacenado`, error);
        return c.json(
          { deal: null, message: "No se pudo acceder a la información almacenada del presupuesto." },
          500
        );
      }
    }

    if (!forceRefresh && storedDeal) {
      return c.json({ deal: storedDeal, refreshed: false });
    }

    try {
      const rawDeal = await getDealById(dealId);

      if (!rawDeal) {
        if (storedDeal) {
          return c.json(
            {
              deal: storedDeal,
              refreshed: false,
              message: "No se encontró el presupuesto solicitado en Pipedrive."
            },
            200
          );
        }

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

      return c.json({ deal, refreshed: true });
    } catch (error) {
      console.error(`Error al consultar el deal ${dealId} en Pipedrive`, error);

      if (storedDeal) {
        return c.json({
          deal: storedDeal,
          refreshed: false,
          message:
            storedDealError?.message ??
            "Se devolvió la versión almacenada del presupuesto porque no se pudo actualizar desde Pipedrive."
        });
      }

      const message =
        storedDealError?.message ??
        (error instanceof Error
          ? error.message
          : "No se pudo obtener el presupuesto desde Pipedrive.");

      return c.json({ deal: null, message }, 502);
    }
  }

  let deals: DealRecord[] = [];
  let storageError: DatabaseError | null = null;
  try {
    deals = await listStoredDeals();
  } catch (error) {
    if (error instanceof DatabaseError) {
      storageError = error;
      console.error("No se pudo acceder a los presupuestos almacenados en la base de datos", error);
    } else {
      console.error("No se pudo obtener el listado de presupuestos almacenados", error);
      return c.json(
        { deals: [], page: 1, limit: 0, message: "No se pudo obtener el listado de presupuestos." },
        500
      );
    }
  }

  if (storageError) {
    return c.json({ deals: [], page: 1, limit: 0, message: storageError.message }, 500);
  }

  if (forceRefresh) {
    await synchronizeDealsFromPipedrive({ force: true, knownDeals: deals });

    try {
      deals = await listStoredDeals();
    } catch (error) {
      if (error instanceof DatabaseError) {
        return c.json({ deals: [], page: 1, limit: 0, message: error.message }, 500);
      }

      console.error(
        "No se pudo actualizar el listado de presupuestos tras la sincronización",
        error
      );
      return c.json(
        { deals: [], page: 1, limit: 0, message: "No se pudo actualizar el listado de presupuestos." },
        500
      );
    }
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

  try {
    await saveDealRecord(deal);
  } catch (error) {
    if (error instanceof DatabaseError) {
      return c.json({ ok: false, message: error.message }, 500);
    }

    console.error("No se pudo guardar el presupuesto en la base de datos", error);
    return c.json({ ok: false, message: "No se pudo guardar el presupuesto." }, 500);
  }

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

  let existingDeal: DealRecord | null = null;
  try {
    existingDeal = await readStoredDeal(dealId);
  } catch (error) {
    if (error instanceof DatabaseError) {
      return c.json({ ok: false, message: error.message }, 500);
    }

    console.error(`No se pudo consultar el presupuesto ${dealId} antes de eliminarlo`, error);
    return c.json({ ok: false, message: "No se pudo consultar el presupuesto indicado." }, 500);
  }

  let removed: boolean;
  try {
    removed = await deleteStoredDeal(dealId);
  } catch (error) {
    if (error instanceof DatabaseError) {
      return c.json({ ok: false, message: error.message }, 500);
    }

    console.error(`No se pudo eliminar el presupuesto ${dealId}`, error);
    return c.json({ ok: false, message: "No se pudo eliminar el presupuesto." }, 500);
  }

  if (!removed && !existingDeal) {
    return c.json({ ok: false, message: "No se encontró el presupuesto indicado." }, 404);
  }

  return c.json({ ok: true, dealId, removedAt: new Date().toISOString() });
});

// Handler manual (evita el adapter y problemas de path)
export const handler: Handler = async (event) => {
  try {
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
  } catch (error) {
    const message =
      error instanceof Error && typeof error.message === "string" && error.message.trim().length > 0
        ? error.message
        : "Internal error";
    const code = (error as { code?: unknown })?.code;
    const detail = (error as { detail?: unknown })?.detail;

    console.error("DEALS API ERROR", { msg: message, code, detail });

    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "DB_ERROR", message })
    };
  }
};
