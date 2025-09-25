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

const DEAL_EXTRAS_ENDPOINT = '/.netlify/functions/api/deal-extras';

const sanitizeExtrasValue = (value: unknown): StoredDealExtras => {
  if (!value || typeof value !== 'object') {
    return { notes: [], documents: [] };
  }

  const record = value as Record<string, unknown>;
  const notes = Array.isArray(record.notes) ? (record.notes as StoredDealNote[]) : [];
  const documents = Array.isArray(record.documents) ? (record.documents as StoredDealDocument[]) : [];

  return { notes, documents };
};

export const loadDealExtras = (_dealId: number): StoredDealExtras => ({
  notes: [],
  documents: []
});

export const persistDealExtras = async (dealId: number, extras: StoredDealExtras) => {
  const sanitized = sanitizeExtrasValue(extras);

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
    console.error('No se pudieron guardar las notas en el servidor compartido', error);
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
    return sanitizeExtrasValue(payload.extras);
  } catch (error) {
    console.error('No se pudieron cargar las notas desde el servidor compartido', error);
    return { notes: [], documents: [] };
  }
};
