// src/services/deals.ts

/**
 * Servicio de Deals (front-end)
 * - Elimina fallbacks legacy (site, hotel_night)
 * - Usa campos normalizados del backend: sede, hotel_pernocta, deal_direction
 * - Tipado fuerte con interfaz Deal completa
 * - Separa productos entre trainings (code startsWith "form-") y extras (resto)
 */

const API_BASE = "/.netlify/functions/api";

// -----------------------------
// Tipos públicos (UI)
// -----------------------------

export interface DealProduct {
  id: number | string;
  name: string;
  code?: string | null;
  quantity?: number | null;
  price?: number | null;
  metadata?: Record<string, unknown>;
}

export interface DealNote {
  id: number | string;
  content: string;
  createdAt?: string;
  author?: string;
}

export interface DealSession {
  id: number | string;
  status?: string;
  start?: string; // ISO
  end?: string;   // ISO
  sede?: string | null;
  address?: string | null;
  trainerIds?: Array<number | string>;
  unitIds?: Array<number | string>;
  comment?: string | null;
}

export interface Deal {
  id: number | string;
  title: string;

  // Campos normalizados (camelCase en UI):
  sede: string | null;
  dealDirection: string | null;
  caes: string | null;
  fundae: string | null;
  hotelPernocta: boolean | string | null; // según backend puede ser boolean o texto

  // Colecciones:
  trainings: DealProduct[];
  extras: DealProduct[];
  notas: DealNote[];
  sesiones: DealSession[];
}

// -----------------------------
// Tipos internos (respuesta API)
// -----------------------------

/**
 * Estructura estimada del backend para un deal.
 * Ajustado a los campos normalizados:
 * - sede (string|null)
 * - deal_direction (string|null)
 * - caes (string|null)
 * - fundae (string|null)
 * - hotel_pernocta (boolean|string|null)
 * - products: Product[]
 * - notes: Note[]
 * - sessions: Session[]
 */
type DealAPI = {
  id: number | string;
  title: string;
  sede?: string | null;
  deal_direction?: string | null;
  caes?: string | null;
  fundae?: string | null;
  hotel_pernocta?: boolean | string | null;

  products?: Array<{
    id: number | string;
    name: string;
    code?: string | null;
    quantity?: number | null;
    price?: number | null;
    // Cualquier otro dato crudo:
    [k: string]: unknown;
  }>;

  notes?: Array<{
    id: number | string;
    content?: string | null;
    createdAt?: string;
    author?: string;
    [k: string]: unknown;
  }>;

  sessions?: Array<{
    id: number | string;
    status?: string | null;
    start?: string | null;
    end?: string | null;
    sede?: string | null;
    address?: string | null;
    trainerIds?: Array<number | string>;
    unitIds?: Array<number | string>;
    comment?: string | null;
    [k: string]: unknown;
  }>;

  // Campos que pueden existir pero NO se usan ya:
  // site?: string;           // LEGACY (NO USAR)
  // hotel_night?: string;    // LEGACY (NO USAR)
  [k: string]: unknown;
};

// -----------------------------
// Utilidades
// -----------------------------

function isTraining(product: DealProduct): boolean {
  const code = (product.code ?? "").toString().toLowerCase();
  return code.startsWith("form-");
}

function mapProduct(p: DealAPI["products"][number]): DealProduct {
  return {
    id: p.id,
    name: String(p.name ?? ""),
    code: (p.code ?? null) as string | null,
    quantity: p.quantity ?? null,
    price: p.price ?? null,
    metadata: p,
  };
}

function mapNote(n: NonNullable<DealAPI["notes"]>[number]): DealNote {
  return {
    id: n.id,
    content: String(n.content ?? ""),
    createdAt: n.createdAt,
    author: n.author,
  };
}

function mapSession(s: NonNullable<DealAPI["sessions"]>[number]): DealSession {
  return {
    id: s.id,
    status: s.status ?? undefined,
    start: s.start ?? undefined,
    end: s.end ?? undefined,
    sede: s.sede ?? null,
    address: s.address ?? null,
    trainerIds: s.trainerIds ?? [],
    unitIds: s.unitIds ?? [],
    comment: s.comment ?? null,
  };
}

function transformDeal(api: DealAPI): Deal {
  const products = (api.products ?? []).map(mapProduct);

  const trainings = products.filter(isTraining);
  const extras = products.filter((p) => !isTraining(p));

  return {
    id: api.id,
    title: String(api.title ?? ""),

    // Campos normalizados (sin fallbacks legacy):
    sede: (api.sede ?? null) as string | null,
    dealDirection: (api.deal_direction ?? null) as string | null,
    caes: (api.caes ?? null) as string | null,
    fundae: (api.fundae ?? null) as string | null,
    hotelPernocta: api.hotel_pernocta ?? null,

    trainings,
    extras,
    notas: (api.notes ?? []).map(mapNote),
    sesiones: (api.sessions ?? []).map(mapSession),
  };
}

// -----------------------------
// Llamadas HTTP
// -----------------------------

async function http<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

// -----------------------------
// API pública del servicio
// -----------------------------

/**
 * Lista deals.
 * @param opts.pipelineId  (opcional) sobreescribe el filtro del backend
 * @param opts.search      (opcional) término de búsqueda
 * @param opts.limit       (opcional) paginación
 * @param opts.offset      (opcional) paginación
 */
export async function listDeals(opts?: {
  pipelineId?: number | string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<Deal[]> {
  const params = new URLSearchParams();
  if (opts?.pipelineId != null) params.set("pipelineId", String(opts.pipelineId));
  if (opts?.search) params.set("q", opts.search);
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.offset != null) params.set("offset", String(opts.offset));

  const url = `${API_BASE}/deals${params.toString() ? `?${params}` : ""}`;

  // Se asume que el backend devuelve { deals: DealAPI[] } o directamente DealAPI[]
  const data = await http<DealAPI[] | { deals: DealAPI[] }>(url);

  const rows = Array.isArray(data) ? data : data.deals ?? [];
  return rows.map(transformDeal);
}

/**
 * Obtiene un deal por id.
 */
export async function getDealById(id: number | string): Promise<Deal> {
  const url = `${API_BASE}/deals/${id}`;
  const data = await http<DealAPI>(url);
  return transformDeal(data);
}

/**
 * Crea o actualiza un deal (según tu backend).
 * Devuelve el Deal transformado.
 * - Este método es opcional; mantenlo si tu UI lo necesita.
 */
export async function upsertDeal(payload: Partial<Deal> & { id?: number | string }): Promise<Deal> {
  const method = payload.id == null ? "POST" : "PUT";
  const url = payload.id == null ? `${API_BASE}/deals` : `${API_BASE}/deals/${payload.id}`;

  // Importante: enviar nombres normalizados que el backend entiende.
  // Nunca enviar `site` ni `hotel_night`.
  const body = {
    title: payload.title,
    sede: payload.sede ?? null,
    deal_direction: payload.dealDirection ?? null,
    caes: payload.caes ?? null,
    fundae: payload.fundae ?? null,
    hotel_pernocta: payload.hotelPernocta ?? null,
    // Si necesitas enviar productos/notas/sesiones, ajusta aquí:
    trainings: payload.trainings ?? [],
    extras: payload.extras ?? [],
    notas: payload.notas ?? [],
    sesiones: payload.sesiones ?? [],
  };

  const data = await http<DealAPI>(url, {
    method,
    body: JSON.stringify(body),
  });

  return transformDeal(data);
}
