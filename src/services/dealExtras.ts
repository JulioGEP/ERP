export interface StoredDealNote {
  id: string;
  content: string;
  createdAt: string;
  dealProductId?: number | null;
  productId?: number | null;
  productName?: string | null;
  shareWithTrainer?: boolean | null;
}

export interface StoredDealDocument {
  id: string;
  name: string;
  url: string;
  createdAt: string;
  dealProductId?: number | null;
  productId?: number | null;
  productName?: string | null;
}

export interface StoredDealExtras {
  notes: StoredDealNote[];
  documents: StoredDealDocument[];
}

const STORAGE_KEY = 'erp-deal-extras-v1';
const DEAL_EXTRAS_ENDPOINT = '/.netlify/functions/api/deal-extras';
const isBrowser = typeof window !== 'undefined';

const readStorage = (): Record<string, StoredDealExtras> => {
  if (!isBrowser) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, StoredDealExtras>;
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }

    return {};
  } catch (error) {
    console.error('No se pudieron leer las notas locales del almacenamiento', error);
    return {};
  }
};

const writeStorage = (value: Record<string, StoredDealExtras>) => {
  if (!isBrowser) {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch (error) {
    console.error('No se pudieron guardar las notas locales en el almacenamiento', error);
  }
};

const sanitizeExtrasValue = (value: unknown): StoredDealExtras => {
  if (!value || typeof value !== 'object') {
    return { notes: [], documents: [] };
  }

  const record = value as Record<string, unknown>;
  const notes = Array.isArray(record.notes) ? (record.notes as StoredDealNote[]) : [];
  const documents = Array.isArray(record.documents) ? (record.documents as StoredDealDocument[]) : [];

  return { notes, documents };
};

const updateDealExtrasInStorage = (dealId: number, extras: StoredDealExtras) => {
  const storage = readStorage();
  storage[String(dealId)] = sanitizeExtrasValue(extras);
  writeStorage(storage);
};

export const loadDealExtras = (dealId: number): StoredDealExtras => {
  const storage = readStorage();
  return sanitizeExtrasValue(storage[String(dealId)]);
};

export const persistDealExtras = async (dealId: number, extras: StoredDealExtras) => {
  const sanitized = sanitizeExtrasValue(extras);
  updateDealExtrasInStorage(dealId, sanitized);

  try {
    const query = new URLSearchParams({ dealId: String(dealId) });
    const response = await fetch(`${DEAL_EXTRAS_ENDPOINT}?${query.toString()}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sanitized)
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Error HTTP ${response.status}`);
    }
  } catch (error) {
    console.error('No se pudieron guardar las notas locales en el servidor compartido', error);
  }
};

export const fetchDealExtras = async (dealId: number): Promise<StoredDealExtras> => {
  try {
    const query = new URLSearchParams({ dealId: String(dealId) });
    const response = await fetch(`${DEAL_EXTRAS_ENDPOINT}?${query.toString()}`);

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Error HTTP ${response.status}`);
    }

    const payload = (await response.json()) as { extras?: unknown };
    const sanitized = sanitizeExtrasValue(payload.extras);
    updateDealExtrasInStorage(dealId, sanitized);
    return sanitized;
  } catch (error) {
    console.error('No se pudieron cargar las notas locales desde el servidor compartido', error);
    return loadDealExtras(dealId);
  }
};
