export interface DealNote {
  id: string;
  content: string;
  createdAt: string | null;
  authorName: string | null;
  source: 'deal' | 'product' | 'local';
  productId: number | null;
  dealProductId: number | null;
}

export interface DealAttachment {
  id: string;
  name: string;
  url: string;
  downloadUrl: string | null;
  fileType: string | null;
  addedAt: string | null;
  addedBy: string | null;
  source: 'deal' | 'product' | 'local';
  productId: number | null;
  dealProductId: number | null;
}

export interface DealProduct {
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
}

export const countSessionsForProduct = (product: DealProduct): number => {
  const rawQuantity = typeof product.quantity === 'number' ? product.quantity : 0;
  const quantity = Number.isFinite(rawQuantity) ? Math.round(rawQuantity) : 0;
  return quantity > 0 ? quantity : 1;
};

export interface DealRecord {
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
}

const FORMATION_CODE_FRAGMENT = 'form-';

const normaliseProductCode = (code: string | null | undefined): string | null => {
  if (typeof code !== 'string') {
    return null;
  }

  const trimmed = code.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.toLocaleLowerCase('es');
};

const registerFormationLabel = (map: Map<string, string>, value: string | null | undefined) => {
  if (typeof value !== 'string') {
    return;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return;
  }

  const normalized = trimmed.toLocaleLowerCase('es');
  if (!map.has(normalized)) {
    map.set(normalized, trimmed);
  }
};

export const splitDealProductsByCode = (
  input: Pick<DealRecord, 'trainingProducts' | 'extraProducts'>
): { trainingProducts: DealProduct[]; extraProducts: DealProduct[] } => {
  const seen = new Set<number>();
  const training: DealProduct[] = [];
  const extras: DealProduct[] = [];

  const classify = (product: DealProduct) => {
    if (seen.has(product.dealProductId)) {
      return;
    }

    seen.add(product.dealProductId);
    const normalizedCode = normaliseProductCode(product.code);

    if (normalizedCode && normalizedCode.includes(FORMATION_CODE_FRAGMENT)) {
      training.push(product);
    } else {
      extras.push(product);
    }
  };

  input.trainingProducts.forEach(classify);
  input.extraProducts.forEach(classify);

  return { trainingProducts: training, extraProducts: extras };
};

export const buildDealFormationLabels = (
  formations: string[],
  trainingProducts: DealProduct[]
): string[] => {
  const map = new Map<string, string>();

  formations.forEach((value) => {
    registerFormationLabel(map, value);
  });

  trainingProducts.forEach((product) => {
    registerFormationLabel(map, product.name);
  });

  return Array.from(map.values());
};

type DealsResponse = {
  deals?: unknown;
};

type DealResponse = {
  deal?: unknown;
  message?: string;
};

const parseErrorMessage = async (response: Response) => {
  const fallbackMessage = 'No se pudo obtener la lista de presupuestos.';
  const cloned = response.clone();

  try {
    const payload = (await cloned.json()) as { message?: string };
    if (payload && typeof payload.message === 'string' && payload.message.trim().length > 0) {
      return payload.message;
    }
  } catch (error) {
    // Ignoramos el error y probamos a leer el cuerpo como texto más abajo.
  }

  try {
    const text = await response.text();
    const trimmed = text.trim();
    return trimmed.length > 0 ? trimmed : fallbackMessage;
  } catch (error) {
    return fallbackMessage;
  }
};

const normaliseDealRecords = (value: unknown): DealRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => sanitizeDealRecord(item))
    .filter((deal): deal is DealRecord => deal !== null);
};

const NETLIFY_DEALS_ENDPOINT = '/.netlify/functions/api/deals';

type FetchDealsOptions = {
  refresh?: boolean;
};

export const fetchDeals = async (options?: FetchDealsOptions): Promise<DealRecord[]> => {
  const query = new URLSearchParams();

  if (options?.refresh) {
    query.set('refresh', '1');
  }

  const endpoint = query.size > 0 ? `${NETLIFY_DEALS_ENDPOINT}?${query.toString()}` : NETLIFY_DEALS_ENDPOINT;
  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const payload = (await response.json()) as DealsResponse;
  return normaliseDealRecords(payload.deals);
};

type FetchDealByIdOptions = {
  refresh?: boolean;
};

export const fetchDealById = async (
  dealId: number,
  options?: FetchDealByIdOptions
): Promise<DealRecord> => {
  const query = new URLSearchParams({ dealId: String(dealId) });

  if (options?.refresh) {
    query.set('refresh', '1');
  }

  const response = await fetch(`${NETLIFY_DEALS_ENDPOINT}?${query.toString()}`);

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const payload = (await response.json()) as DealResponse;

  const deal = sanitizeDealRecord(payload.deal);

  if (!deal) {
    throw new Error(payload.message || 'No se encontró el presupuesto solicitado.');
  }

  return deal;
};

type SyncDealResponse = {
  ok: boolean;
  message?: string;
};

export const syncDeal = async (dealId: number): Promise<void> => {
  const response = await fetch('/.netlify/functions/api/deals/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dealId })
  });

  let payload: SyncDealResponse | null = null;

  try {
    payload = (await response.json()) as SyncDealResponse;
  } catch (error) {
    console.error('No se pudo interpretar la respuesta al sincronizar el presupuesto', error);
  }

  if (!response.ok || !payload?.ok) {
    const message = payload?.message ?? 'No se pudo sincronizar el presupuesto solicitado.';
    throw new Error(message);
  }
};

export const persistDeal = async (deal: DealRecord): Promise<DealRecord> => {
  const response = await fetch(NETLIFY_DEALS_ENDPOINT, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deal })
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const payload = (await response.json()) as DealResponse;
  const stored = sanitizeDealRecord(payload.deal);

  if (!stored) {
    throw new Error('La API devolvió un presupuesto con un formato no válido.');
  }

  return stored;
};

export const deleteDeal = async (dealId: number): Promise<void> => {
  const query = new URLSearchParams({ dealId: String(dealId) });
  const response = await fetch(`${NETLIFY_DEALS_ENDPOINT}?${query.toString()}`, {
    method: 'DELETE'
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
};

const MANUAL_DEALS_STORAGE_KEY = 'erp-manual-deals-v1';
const HIDDEN_DEALS_STORAGE_KEY = 'erp-hidden-deals-v1';
const MANUAL_DEALS_ENDPOINT = '/.netlify/functions/api/manual-deals';
const HIDDEN_DEALS_ENDPOINT = '/.netlify/functions/api/hidden-deals';
const isBrowser = typeof window !== 'undefined';

const parseString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const parseOptionalString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const parseOptionalNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const parseStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item.length > 0)
    )
  );
};

const parseNumberArray = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === 'number' ? item : Number.parseInt(String(item), 10)))
    .filter((item) => Number.isFinite(item));
};

const parseDealNotes = (value: unknown): DealNote[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const candidate = item as Partial<DealNote> & { source?: unknown };
      const source = candidate.source;
      const validSource =
        source === 'deal' || source === 'product' || source === 'local' ? source : 'deal';

      return {
        id: parseString(candidate.id),
        content: parseString(candidate.content),
        createdAt: parseOptionalString(candidate.createdAt),
        authorName: parseOptionalString(candidate.authorName),
        source: validSource,
        productId: parseOptionalNumber(candidate.productId),
        dealProductId: parseOptionalNumber(candidate.dealProductId)
      } satisfies DealNote;
    })
    .filter((note): note is DealNote => note !== null);
};

const parseDealAttachments = (value: unknown): DealAttachment[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const candidate = item as Partial<DealAttachment>;

      return {
        id: parseString(candidate.id),
        name: parseString(candidate.name),
        url: parseString(candidate.url),
        downloadUrl: parseOptionalString(candidate.downloadUrl),
        fileType: parseOptionalString(candidate.fileType),
        addedAt: parseOptionalString(candidate.addedAt),
        addedBy: parseOptionalString(candidate.addedBy),
        source:
          candidate.source === 'deal' || candidate.source === 'product' || candidate.source === 'local'
            ? candidate.source
            : 'deal',
        productId: parseOptionalNumber(candidate.productId),
        dealProductId: parseOptionalNumber(candidate.dealProductId)
      } satisfies DealAttachment;
    })
    .filter((attachment): attachment is DealAttachment => attachment !== null);
};

const parseDealProducts = (value: unknown): DealProduct[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const candidate = item as Partial<DealProduct> & { isTraining?: unknown };

      return {
        dealProductId: parseNumber(candidate.dealProductId, 0),
        productId: parseOptionalNumber(candidate.productId),
        name: parseString(candidate.name),
        code: parseOptionalString(candidate.code),
        quantity: parseNumber(candidate.quantity, 0),
        itemPrice: parseOptionalNumber(candidate.itemPrice),
        recommendedHours: parseOptionalNumber(candidate.recommendedHours),
        recommendedHoursRaw: parseOptionalString(candidate.recommendedHoursRaw),
        notes: parseDealNotes(candidate.notes),
        attachments: parseDealAttachments(candidate.attachments),
        isTraining: candidate.isTraining === true
      } satisfies DealProduct;
    })
    .filter((product): product is DealProduct => product !== null);
};

const sanitizeDealRecord = (value: unknown): DealRecord | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<DealRecord> & Record<string, unknown>;
  const identifier = parseNumber(candidate.id, Number.NaN);

  if (!Number.isFinite(identifier)) {
    return null;
  }

  const wonDate =
    parseOptionalString(candidate.wonDate) ??
    parseOptionalString(candidate['won_time']) ??
    parseOptionalString(candidate['wonTime']);

  return {
    id: identifier,
    title: parseString(candidate.title),
    clientId: parseOptionalNumber(candidate.clientId),
    clientName: parseOptionalString(candidate.clientName),
    sede: parseOptionalString(candidate.sede),
    address: parseOptionalString(candidate.address),
    caes: parseOptionalString(candidate.caes),
    fundae: parseOptionalString(candidate.fundae),
    hotelPernocta: parseOptionalString(candidate.hotelPernocta),
    pipelineId: parseOptionalNumber(candidate.pipelineId),
    pipelineName: parseOptionalString(candidate.pipelineName),
    wonDate,
    formations: parseStringArray(candidate.formations),
    trainingProducts: parseDealProducts(candidate.trainingProducts),
    extraProducts: parseDealProducts(candidate.extraProducts),
    notes: parseDealNotes(candidate.notes),
    attachments: parseDealAttachments(candidate.attachments)
  } satisfies DealRecord;
};

const dedupeDeals = (deals: DealRecord[]): DealRecord[] => {
  const seen = new Set<number>();
  const result: DealRecord[] = [];

  deals.forEach((deal) => {
    if (!seen.has(deal.id)) {
      seen.add(deal.id);
      result.push(deal);
    }
  });

  return result;
};

const sanitizeManualDealsForStorage = (deals: DealRecord[]): DealRecord[] =>
  dedupeDeals(
    deals
      .map((deal) => sanitizeDealRecord(deal))
      .filter((deal): deal is DealRecord => deal !== null)
  );

const persistManualDealsLocally = (deals: DealRecord[]) => {
  if (!isBrowser) {
    return;
  }

  try {
    window.localStorage.setItem(MANUAL_DEALS_STORAGE_KEY, JSON.stringify(deals));
  } catch (error) {
    console.error('No se pudieron guardar los deals manuales en el almacenamiento local', error);
  }
};

const sanitizeHiddenDealIds = (dealIds: number[]): number[] =>
  Array.from(new Set(dealIds.filter((dealId) => Number.isFinite(dealId))));

const persistHiddenDealIdsLocally = (dealIds: number[]) => {
  if (!isBrowser) {
    return;
  }

  try {
    window.localStorage.setItem(HIDDEN_DEALS_STORAGE_KEY, JSON.stringify(dealIds));
  } catch (error) {
    console.error('No se pudo guardar la lista de deals ocultos', error);
  }
};

export const fetchSharedManualDeals = async (): Promise<DealRecord[]> => {
  try {
    const response = await fetch(MANUAL_DEALS_ENDPOINT);

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Error HTTP ${response.status}`);
    }

    const payload = (await response.json()) as { deals?: unknown };
    const deals = normaliseDealRecords(payload.deals);
    const sanitized = dedupeDeals(deals);
    persistManualDealsLocally(sanitized);
    return sanitized;
  } catch (error) {
    console.error('No se pudieron cargar los deals manuales compartidos', error);
    return loadStoredManualDeals();
  }
};

export const fetchSharedHiddenDealIds = async (): Promise<number[]> => {
  try {
    const response = await fetch(HIDDEN_DEALS_ENDPOINT);

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Error HTTP ${response.status}`);
    }

    const payload = (await response.json()) as { dealIds?: unknown };
    const hiddenIds = parseNumberArray(payload.dealIds);
    const sanitized = sanitizeHiddenDealIds(hiddenIds);
    persistHiddenDealIdsLocally(sanitized);
    return sanitized;
  } catch (error) {
    console.error('No se pudieron cargar los deals ocultos compartidos', error);
    return loadHiddenDealIds();
  }
};

export const loadStoredManualDeals = (): DealRecord[] => {
  if (!isBrowser) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(MANUAL_DEALS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const sanitized = parsed
      .map((value) => sanitizeDealRecord(value))
      .filter((deal): deal is DealRecord => deal !== null);

    return dedupeDeals(sanitized);
  } catch (error) {
    console.error('No se pudieron leer los deals manuales del almacenamiento local', error);
    return [];
  }
};

export const persistStoredManualDeals = async (deals: DealRecord[]) => {
  const sanitized = sanitizeManualDealsForStorage(deals);
  persistManualDealsLocally(sanitized);

  try {
    const response = await fetch(MANUAL_DEALS_ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deals: sanitized })
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Error HTTP ${response.status}`);
    }
  } catch (error) {
    console.error('No se pudieron guardar los deals manuales en el servidor compartido', error);
  }
};

export const loadHiddenDealIds = (): number[] => {
  if (!isBrowser) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(HIDDEN_DEALS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    return parseNumberArray(parsed);
  } catch (error) {
    console.error('No se pudo leer la lista de deals ocultos', error);
    return [];
  }
};

export const persistHiddenDealIds = async (dealIds: number[]) => {
  const uniqueIds = sanitizeHiddenDealIds(dealIds);
  persistHiddenDealIdsLocally(uniqueIds);

  try {
    const response = await fetch(HIDDEN_DEALS_ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealIds: uniqueIds })
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Error HTTP ${response.status}`);
    }
  } catch (error) {
    console.error('No se pudo guardar la lista de deals ocultos en el servidor compartido', error);
  }
};
