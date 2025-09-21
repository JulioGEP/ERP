import type { Handler } from '@netlify/functions';

const API_URL = process.env.PIPEDRIVE_API_URL;
const API_TOKEN = process.env.PIPEDRIVE_API_TOKEN;
const DEFAULT_STAGE_ID = 3;
const SEDE_FIELD_KEY = '676d6bd51e52999c582c01f67c99a35ed30bf6ae';

interface PipedriveDeal {
  id: number;
  title: string;
  org_id?: { value?: number; name?: string } | number | null;
  org_name?: string | null;
  [key: string]: unknown;
}

interface DealProductItem {
  product?: {
    name?: string;
    code?: string;
  };
}

interface NormalisedDeal {
  id: number;
  title: string;
  clientId: number | null;
  clientName: string | null;
  sede: string | null;
  formations: string[];
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

const extractClient = (deal: PipedriveDeal): { id: number | null; name: string | null } => {
  const org = deal.org_id;
  if (typeof org === 'number') {
    return { id: org, name: deal.org_name ?? null };
  }

  if (org && typeof org === 'object') {
    return {
      id: typeof org.value === 'number' ? org.value : null,
      name: typeof org.name === 'string' ? org.name : deal.org_name ?? null
    };
  }

  return {
    id: null,
    name: deal.org_name ?? null
  };
};

const fetchDealProducts = async (dealId: number): Promise<string[]> => {
  type ProductsResponse = { data?: DealProductItem[] | null };

  try {
    const productsResponse = await fetchJson<ProductsResponse>(`deals/${dealId}/products`, {});
    const items = productsResponse.data ?? [];

    return items
      .map((item) => item.product)
      .filter((product): product is NonNullable<DealProductItem['product']> => Boolean(product?.name))
      .filter((product) => (product.code ?? '').toLowerCase().startsWith('form-'))
      .map((product) => product.name!.trim())
      .filter((name, index, array) => name.length > 0 && array.indexOf(name) === index);
  } catch (error) {
    console.error(`No se pudieron obtener los productos del deal ${dealId}`, error);
    return [];
  }
};

const loadDeals = async (stageId: number): Promise<NormalisedDeal[]> => {
  type DealsResponse = { data?: PipedriveDeal[] | null };

  const [sedeOptions, dealsResponse] = await Promise.all([
    loadSedeOptions(),
    fetchJson<DealsResponse>('deals', {
      stage_id: stageId,
      limit: 500,
      status: 'all_not_deleted',
      sort: 'update_time DESC'
    })
  ]);

  const deals = dealsResponse.data ?? [];
  const normalised: NormalisedDeal[] = [];

  for (const deal of deals) {
    const client = extractClient(deal);
    const sedeRaw = (deal as Record<string, unknown>)[SEDE_FIELD_KEY];
    const sedeLabel = sedeRaw != null ? sedeOptions.get(String(sedeRaw)) ?? null : null;
    const formations = await fetchDealProducts(deal.id);

    normalised.push({
      id: deal.id,
      title: deal.title,
      clientId: client.id,
      clientName: client.name,
      sede: sedeLabel,
      formations
    });
  }

  return normalised;
};

export const handler: Handler = async (event) => {
  try {
    if (!API_TOKEN || !API_URL) {
      return {
        statusCode: 500,
        headers: defaultHeaders,
        body: JSON.stringify({ message: 'Faltan las credenciales de Pipedrive en el entorno.' })
      };
    }

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
