import type { Handler } from '@netlify/functions';

const API_URL = process.env.PIPEDRIVE_API_URL;
const API_TOKEN = process.env.PIPEDRIVE_API_TOKEN;
const DEFAULT_STAGE_ID = 3;
const SEDE_FIELD_KEY = '676d6bd51e52999c582c01f67c99a35ed30bf6ae';
const ADDRESS_FIELD_KEY = '8b2a7570f5ba8aa4754f061cd9dc92fd778376a7';
const RECOMMENDED_HOURS_FIELD_KEY = '38f11c8876ecde803a027fbf3c9041fda2ae7eb7';
const TRAINING_CODE_PREFIX = 'form-';

interface PipedriveDeal {
  id: number;
  title: string;
  pipeline_id?: number | string | null;
  org_id?: { value?: number; name?: string } | number | null;
  org_name?: string | null;
  [key: string]: unknown;
}

interface DealProductItem {
  id?: number | string | null;
  product_id?: number | string | null;
  quantity?: number | string | null;
  name?: string | null;
  code?: string | null;
  item_price?: number | string | null;
  product?: PipedriveProduct | null;
  [key: string]: unknown;
}

interface PipedriveProduct {
  id?: number;
  name?: string | null;
  code?: string | null;
  description?: string | null;
  [key: string]: unknown;
}

interface PipedriveNote {
  id?: number;
  content?: string | null;
  add_time?: string | null;
  user_id?: { name?: string | null } | number | null;
  [key: string]: unknown;
}

interface PipedriveFile {
  id?: number;
  file_name?: string | null;
  url?: string | null;
  download_url?: string | null;
  file_type?: string | null;
  add_time?: string | null;
  user_id?: { name?: string | null } | number | null;
  [key: string]: unknown;
}

interface NormalisedNote {
  id: string;
  content: string;
  createdAt: string | null;
  authorName: string | null;
  source: 'deal' | 'product';
  productId: number | null;
  dealProductId: number | null;
}

interface NormalisedAttachment {
  id: string;
  name: string;
  url: string;
  downloadUrl: string | null;
  fileType: string | null;
  addedAt: string | null;
  addedBy: string | null;
  source: 'deal' | 'product';
  productId: number | null;
  dealProductId: number | null;
}

interface NormalisedProduct {
  dealProductId: number;
  productId: number | null;
  name: string;
  code: string | null;
  quantity: number;
  itemPrice: number | null;
  recommendedHours: number | null;
  recommendedHoursRaw: string | null;
  notes: NormalisedNote[];
  attachments: NormalisedAttachment[];
  isTraining: boolean;
}

interface NormalisedDeal {
  id: number;
  title: string;
  clientId: number | null;
  clientName: string | null;
  sede: string | null;
  address: string | null;
  pipelineId: number | null;
  pipelineName: string | null;
  wonDate: string | null;
  formations: string[];
  trainingProducts: NormalisedProduct[];
  extraProducts: NormalisedProduct[];
  notes: NormalisedNote[];
  attachments: NormalisedAttachment[];
}

const defaultHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

const buildUrl = (path: string, params: Record<string, string | number | undefined>) => {
  if (!API_URL) {
    throw new Error('Falta la variable PIPEDRIVE_API_URL');
  }

  const url = new URL(path, API_URL.endsWith('/') ? API_URL : `${API_URL}/`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  if (API_TOKEN) {
    url.searchParams.set('api_token', API_TOKEN);
  }

  return url.toString();
};

const fetchJson = async <T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> => {
  const response = await fetch(buildUrl(path, params));

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Error ${response.status} en Pipedrive: ${text}`);
  }

  return (await response.json()) as T;
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalised = value.replace(/,/g, '.');
    const parsed = Number.parseFloat(normalised);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
};

const toInteger = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
};

const cleanNoteContent = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }

  const withoutTags = value.replace(/<[^>]*>/g, ' ');
  return withoutTags.replace(/\s+/g, ' ').trim();
};

const parseAuthorName = (value: unknown): string | null => {
  if (typeof value === 'object' && value !== null && 'name' in value) {
    const name = (value as { name?: unknown }).name;
    if (typeof name === 'string' && name.trim().length > 0) {
      return name.trim();
    }
  }

  return null;
};

const parseDateValue = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normaliseNote = (
  note: PipedriveNote,
  source: 'deal' | 'product',
  context: { productId?: number | null; dealProductId?: number | null } = {}
): NormalisedNote => ({
  id: note.id != null ? String(note.id) : `${source}-${Math.random().toString(36).slice(2)}`,
  content: cleanNoteContent(note.content),
  createdAt: typeof note.add_time === 'string' ? note.add_time : null,
  authorName: parseAuthorName(note.user_id),
  source,
  productId: context.productId ?? null,
  dealProductId: context.dealProductId ?? null
});

const normaliseAttachment = (
  file: PipedriveFile,
  source: 'deal' | 'product',
  context: { productId?: number | null; dealProductId?: number | null } = {}
): NormalisedAttachment | null => {
  const url = typeof file.url === 'string' && file.url.trim().length > 0 ? file.url.trim() : null;

  if (!url) {
    return null;
  }

  const name = typeof file.file_name === 'string' && file.file_name.trim().length > 0 ? file.file_name.trim() : 'Documento';

  return {
    id: file.id != null ? String(file.id) : `${source}-${Math.random().toString(36).slice(2)}`,
    name,
    url,
    downloadUrl: typeof file.download_url === 'string' && file.download_url.trim().length > 0 ? file.download_url.trim() : null,
    fileType: typeof file.file_type === 'string' ? file.file_type : null,
    addedAt: typeof file.add_time === 'string' ? file.add_time : null,
    addedBy: parseAuthorName(file.user_id),
    source,
    productId: context.productId ?? null,
    dealProductId: context.dealProductId ?? null
  };
};

const parseRecommendedHours = (value: unknown): { raw: string | null; hours: number | null } => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { raw: String(value), hours: value };
  }

  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) {
      return { raw: null, hours: null };
    }

    const match = raw.match(/(\d+(?:[.,]\d+)?)/);

    if (match) {
      const parsed = Number.parseFloat(match[1].replace(',', '.'));
      if (Number.isFinite(parsed)) {
        return { raw, hours: parsed };
      }
    }

    return { raw, hours: null };
  }

  return { raw: null, hours: null };
};

const loadSedeOptions = async (): Promise<Map<string, string>> => {
  type FieldOption = { id: number | string; label: string };
  type FieldResponse = { data?: { options?: FieldOption[] } | null };

  try {
    const field = await fetchJson<FieldResponse>(`dealFields/${SEDE_FIELD_KEY}`, {});
    const options = field.data?.options ?? [];
    const map = new Map<string, string>();

    options.forEach((option) => {
      map.set(String(option.id), option.label);
    });

    return map;
  } catch (error) {
    console.error('No se pudieron cargar las opciones del campo Sede', error);
    return new Map<string, string>();
  }
};

const normaliseSedeValue = (value: unknown, options: Map<string, string>): string | null => {
  if (value == null) {
    return null;
  }

  const findByOptionKey = (rawKey: string): string | null => {
    const candidate = options.get(rawKey);

    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      return trimmed.length > 0 ? trimmed : null;
    }

    return null;
  };

  const directMatch = findByOptionKey(String(value));
  if (directMatch) {
    return directMatch;
  }

  if (Array.isArray(value)) {
    const labels = value
      .map((item) => normaliseSedeValue(item, options))
      .filter((label): label is string => Boolean(label && label.trim().length > 0));

    if (labels.length > 0) {
      return Array.from(new Set(labels)).join(', ');
    }

    return null;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;

    if (typeof record.label === 'string') {
      const trimmed = record.label.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }

    if ('value' in record) {
      const nested = normaliseSedeValue(record.value, options);
      if (nested) {
        return nested;
      }
    }

    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parts = trimmed
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    if (parts.length > 1) {
      const labels = parts
        .map((part) => normaliseSedeValue(part, options))
        .filter((label): label is string => Boolean(label && label.trim().length > 0));

      if (labels.length > 0) {
        return Array.from(new Set(labels)).join(', ');
      }
    }

    const fromTrimmed = findByOptionKey(trimmed);
    if (fromTrimmed) {
      return fromTrimmed;
    }

    if (!/^\d+$/.test(trimmed)) {
      return trimmed;
    }

    return null;
  }

  return null;
};

const loadPipelineMap = async (): Promise<Map<number, string>> => {
  type Pipeline = { id: number; name?: string | null };
  type PipelinesResponse = { data?: Pipeline[] | null };

  try {
    const response = await fetchJson<PipelinesResponse>('pipelines', {});
    const pipelines = response.data ?? [];
    const map = new Map<number, string>();

    pipelines.forEach((pipeline) => {
      if (typeof pipeline.id === 'number' && pipeline.name) {
        map.set(pipeline.id, pipeline.name);
      }
    });

    return map;
  } catch (error) {
    console.error('No se pudieron cargar los embudos de Pipedrive', error);
    return new Map<number, string>();
  }
};

const extractClient = (deal: PipedriveDeal): { id: number | null; name: string | null } => {
  const org = deal.org_id;
  if (typeof org === 'number') {
    return { id: org, name: deal.org_name ?? null };
  }

  if (org && typeof org === 'object') {
    return {
      id: typeof org.value === 'number' ? org.value : null,
      name: typeof (org as { name?: unknown }).name === 'string' ? ((org as { name?: unknown }).name as string) : deal.org_name ?? null
    };
  }

  return {
    id: null,
    name: deal.org_name ?? null
  };
};

const fetchDealNotes = async (dealId: number): Promise<NormalisedNote[]> => {
  type NotesResponse = { data?: PipedriveNote[] | null };

  try {
    const response = await fetchJson<NotesResponse>(`deals/${dealId}/notes`, {
      sort_by: 'add_time',
      sort_direction: 'desc'
    });

    const notes = response.data ?? [];
    return notes
      .map((note) => normaliseNote(note, 'deal'))
      .filter((note) => note.content.length > 0);
  } catch (error) {
    console.error(`No se pudieron obtener las notas del deal ${dealId}`, error);
    return [];
  }
};

const fetchDealFiles = async (dealId: number): Promise<NormalisedAttachment[]> => {
  type FilesResponse = { data?: PipedriveFile[] | null };

  try {
    const response = await fetchJson<FilesResponse>(`deals/${dealId}/files`, {
      sort: 'add_time DESC'
    });

    const files = response.data ?? [];
    return files
      .map((file) => normaliseAttachment(file, 'deal'))
      .filter((attachment): attachment is NormalisedAttachment => Boolean(attachment));
  } catch (error) {
    console.error(`No se pudieron obtener los archivos del deal ${dealId}`, error);
    return [];
  }
};

const fetchProductDetail = async (
  productId: number,
  cache: Map<number, PipedriveProduct | null>
): Promise<PipedriveProduct | null> => {
  if (cache.has(productId)) {
    return cache.get(productId) ?? null;
  }

  type ProductResponse = { data?: PipedriveProduct | null };

  try {
    const response = await fetchJson<ProductResponse>(`products/${productId}`, {});
    const product = response.data ?? null;
    cache.set(productId, product);
    return product;
  } catch (error) {
    console.error(`No se pudo obtener la información del producto ${productId}`, error);
    cache.set(productId, null);
    return null;
  }
};

const fetchProductNotes = async (
  productId: number,
  cache: Map<number, NormalisedNote[]>
): Promise<NormalisedNote[]> => {
  if (cache.has(productId)) {
    return cache.get(productId) ?? [];
  }

  type NotesResponse = { data?: PipedriveNote[] | null };

  try {
    const response = await fetchJson<NotesResponse>(`products/${productId}/notes`, {
      sort_by: 'add_time',
      sort_direction: 'desc'
    });

    const notes = (response.data ?? [])
      .map((note) => normaliseNote(note, 'product', { productId }))
      .filter((note) => note.content.length > 0);

    cache.set(productId, notes);
    return notes;
  } catch (error) {
    console.error(`No se pudieron obtener las notas del producto ${productId}`, error);
    cache.set(productId, []);
    return [];
  }
};

const fetchProductFiles = async (
  productId: number,
  cache: Map<number, NormalisedAttachment[]>
): Promise<NormalisedAttachment[]> => {
  if (cache.has(productId)) {
    return cache.get(productId) ?? [];
  }

  type FilesResponse = { data?: PipedriveFile[] | null };

  try {
    const response = await fetchJson<FilesResponse>(`products/${productId}/files`, {
      sort: 'add_time DESC'
    });

    const files = (response.data ?? [])
      .map((file) => normaliseAttachment(file, 'product', { productId }))
      .filter((attachment): attachment is NormalisedAttachment => Boolean(attachment));

    cache.set(productId, files);
    return files;
  } catch (error) {
    console.error(`No se pudieron obtener los archivos del producto ${productId}`, error);
    cache.set(productId, []);
    return [];
  }
};

const fetchDealProductsDetailed = async (
  dealId: number,
  caches: {
    productDetails: Map<number, PipedriveProduct | null>;
    productNotes: Map<number, NormalisedNote[]>;
    productFiles: Map<number, NormalisedAttachment[]>;
  }
): Promise<NormalisedProduct[]> => {
  type ProductsResponse = { data?: DealProductItem[] | null };

  try {
    const productsResponse = await fetchJson<ProductsResponse>(`deals/${dealId}/products`, {
      include_product_data: 1
    });

    const items = productsResponse.data ?? [];

    const products = await Promise.all(
      items.map(async (item) => {
        const dealProductId = toInteger(item.id);

        if (dealProductId == null) {
          return null;
        }

        const rawQuantity = toNumber(item.quantity);
        const quantity = rawQuantity != null && rawQuantity > 0 ? rawQuantity : 0;

        const rawItemPrice = toNumber(item.item_price);
        const itemPrice = rawItemPrice != null ? rawItemPrice : null;

        const embeddedProduct = item.product ?? null;
        const productId =
          toInteger(item.product_id) ??
          (embeddedProduct && typeof embeddedProduct.id === 'number' ? embeddedProduct.id : null);

        const candidateNames = [
          typeof item.name === 'string' ? item.name : null,
          embeddedProduct && typeof embeddedProduct.name === 'string' ? embeddedProduct.name : null
        ];

        const name = candidateNames.find((value) => value && value.trim().length > 0)?.trim() ?? 'Producto sin nombre';

        const candidateCodes = [
          typeof item.code === 'string' ? item.code : null,
          embeddedProduct && typeof embeddedProduct.code === 'string' ? embeddedProduct.code : null
        ];

        const code = candidateCodes.find((value) => value && value.trim().length > 0)?.trim() ?? null;

        let recommendedRaw: string | null = null;
        let recommendedHours: number | null = null;

        const recommendedFromItem = (item as Record<string, unknown>)[RECOMMENDED_HOURS_FIELD_KEY];
        const parsedFromItem = parseRecommendedHours(recommendedFromItem);

        if (parsedFromItem.raw) {
          recommendedRaw = parsedFromItem.raw;
          recommendedHours = parsedFromItem.hours;
        }

        if (productId != null && (recommendedRaw == null || recommendedHours == null)) {
          const productDetail = await fetchProductDetail(productId, caches.productDetails);

          if (productDetail) {
            const fromProduct = parseRecommendedHours((productDetail as Record<string, unknown>)[RECOMMENDED_HOURS_FIELD_KEY]);

            if (fromProduct.raw) {
              recommendedRaw = fromProduct.raw;
              recommendedHours = fromProduct.hours;
            }
          }
        }

        if (embeddedProduct && (recommendedRaw == null || recommendedHours == null)) {
          const fromEmbedded = parseRecommendedHours((embeddedProduct as Record<string, unknown>)[RECOMMENDED_HOURS_FIELD_KEY]);

          if (fromEmbedded.raw) {
            recommendedRaw = fromEmbedded.raw;
            recommendedHours = fromEmbedded.hours;
          }
        }

        const productNotes = productId != null ? await fetchProductNotes(productId, caches.productNotes) : [];
        const productFiles = productId != null ? await fetchProductFiles(productId, caches.productFiles) : [];

        const notesWithContext = productNotes.map((note) => ({
          ...note,
          dealProductId,
          productId: note.productId ?? productId
        }));

        const filesWithContext = productFiles.map((file) => ({
          ...file,
          dealProductId,
          productId: file.productId ?? productId
        }));

        const isTraining = Boolean((code ?? '').toLowerCase().startsWith(TRAINING_CODE_PREFIX));

        return {
          dealProductId,
          productId,
          name,
          code,
          quantity,
          itemPrice,
          recommendedHours,
          recommendedHoursRaw: recommendedRaw,
          notes: notesWithContext,
          attachments: filesWithContext,
          isTraining
        } satisfies NormalisedProduct;
      })
    );

    return products.filter((product): product is NormalisedProduct => Boolean(product));
  } catch (error) {
    console.error(`No se pudieron obtener los productos del deal ${dealId}`, error);
    return [];
  }
};

const normaliseDeal = async (
  deal: PipedriveDeal,
  sedeOptions: Map<string, string>,
  pipelineMap: Map<number, string>,
  caches: {
    productDetails: Map<number, PipedriveProduct | null>;
    productNotes: Map<number, NormalisedNote[]>;
    productFiles: Map<number, NormalisedAttachment[]>;
  }
): Promise<NormalisedDeal> => {
  const client = extractClient(deal);
  const sedeRaw = (deal as Record<string, unknown>)[SEDE_FIELD_KEY];
  const sede = normaliseSedeValue(sedeRaw, sedeOptions);

  const addressRaw = (deal as Record<string, unknown>)[ADDRESS_FIELD_KEY];
  const address = typeof addressRaw === 'string' && addressRaw.trim().length > 0 ? addressRaw.trim() : null;

  const pipelineId = toInteger(deal.pipeline_id);
  const pipelineName = pipelineId != null ? pipelineMap.get(pipelineId) ?? null : null;
  const wonDate = parseDateValue((deal as Record<string, unknown>).won_time);

  const [products, dealNotes, dealFiles] = await Promise.all([
    fetchDealProductsDetailed(deal.id, caches),
    fetchDealNotes(deal.id),
    fetchDealFiles(deal.id)
  ]);

  const trainingProducts = products.filter((product) => product.isTraining);
  const extraProducts = products.filter((product) => !product.isTraining);

  const productNotes = products.flatMap((product) => product.notes.map((note) => ({
    ...note,
    dealProductId: product.dealProductId,
    productId: note.productId ?? product.productId
  })));

  const productAttachments = products.flatMap((product) => product.attachments.map((attachment) => ({
    ...attachment,
    dealProductId: product.dealProductId,
    productId: attachment.productId ?? product.productId
  })));

  const notes = [...dealNotes, ...productNotes];
  const attachments = [...dealFiles, ...productAttachments];

  const formations = trainingProducts
    .map((product) => product.name)
    .filter((name, index, array) => name && array.indexOf(name) === index);

  return {
    id: deal.id,
    title: deal.title,
    clientId: client.id,
    clientName: client.name,
    sede,
    address,
    pipelineId,
    pipelineName,
    wonDate,
    formations,
    trainingProducts,
    extraProducts,
    notes,
    attachments
  };
};

const loadDeals = async (stageId: number): Promise<NormalisedDeal[]> => {
  type DealsResponse = { data?: PipedriveDeal[] | null };

  const [sedeOptions, pipelineMap, dealsResponse] = await Promise.all([
    loadSedeOptions(),
    loadPipelineMap(),
    fetchJson<DealsResponse>('deals', {
      stage_id: stageId,
      limit: 500,
      status: 'all_not_deleted',
      sort: 'update_time DESC'
    })
  ]);

  const deals = dealsResponse.data ?? [];

  const caches = {
    productDetails: new Map<number, PipedriveProduct | null>(),
    productNotes: new Map<number, NormalisedNote[]>(),
    productFiles: new Map<number, NormalisedAttachment[]>()
  };

  return Promise.all(deals.map((deal) => normaliseDeal(deal, sedeOptions, pipelineMap, caches)));
};

const loadDealById = async (dealId: number): Promise<NormalisedDeal | null> => {
  type DealResponse = { data?: PipedriveDeal | null };

  const [sedeOptions, pipelineMap, dealResponse] = await Promise.all([
    loadSedeOptions(),
    loadPipelineMap(),
    fetchJson<DealResponse>(`deals/${dealId}`, {})
  ]);

  const deal = dealResponse.data;
  if (!deal) {
    return null;
  }

  const caches = {
    productDetails: new Map<number, PipedriveProduct | null>(),
    productNotes: new Map<number, NormalisedNote[]>(),
    productFiles: new Map<number, NormalisedAttachment[]>()
  };

  return normaliseDeal(deal, sedeOptions, pipelineMap, caches);
};

export const handler: Handler = async (event) => {
  if (!API_TOKEN || !API_URL) {
    return {
      statusCode: 500,
      headers: defaultHeaders,
      body: JSON.stringify({ message: 'Faltan las credenciales de Pipedrive en el entorno.' })
    };
  }

  const dealParam = event.queryStringParameters?.dealId;
  if (dealParam) {
    const dealId = Number.parseInt(dealParam, 10);

    if (!Number.isFinite(dealId) || dealId <= 0) {
      return {
        statusCode: 400,
        headers: defaultHeaders,
        body: JSON.stringify({ message: 'El identificador del presupuesto no es válido.' })
      };
    }

    try {
      const deal = await loadDealById(dealId);

      if (!deal) {
        return {
          statusCode: 404,
          headers: defaultHeaders,
          body: JSON.stringify({ message: 'No se encontró el presupuesto solicitado.' })
        };
      }

      return {
        statusCode: 200,
        headers: defaultHeaders,
        body: JSON.stringify({ deal })
      };
    } catch (error) {
      console.error(`Error al cargar el presupuesto ${dealId} desde Pipedrive`, error);

      if (error instanceof Error && error.message.includes('Error 404')) {
        return {
          statusCode: 404,
          headers: defaultHeaders,
          body: JSON.stringify({ message: 'No se encontró el presupuesto solicitado.' })
        };
      }

      return {
        statusCode: 500,
        headers: defaultHeaders,
        body: JSON.stringify({
          message: 'No se pudo cargar el presupuesto solicitado.',
          detail: error instanceof Error ? error.message : 'Error desconocido'
        })
      };
    }
  }

  try {
    const stageParam = event.queryStringParameters?.stageId;
    const stageId = stageParam ? Number.parseInt(stageParam, 10) || DEFAULT_STAGE_ID : DEFAULT_STAGE_ID;

    const deals = await loadDeals(stageId);

    return {
      statusCode: 200,
      headers: defaultHeaders,
      body: JSON.stringify({ deals })
    };
  } catch (error) {
    console.error('Error al cargar los presupuestos de Pipedrive', error);

    return {
      statusCode: 500,
      headers: defaultHeaders,
      body: JSON.stringify({
        message: 'No se pudieron cargar los presupuestos desde Pipedrive.',
        detail: error instanceof Error ? error.message : 'Error desconocido'
      })
    };
  }
};
