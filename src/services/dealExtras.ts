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

export const loadDealExtras = (dealId: number): StoredDealExtras => {
  const storage = readStorage();
  return storage[String(dealId)] ?? { notes: [], documents: [] };
};

export const persistDealExtras = (dealId: number, extras: StoredDealExtras) => {
  const storage = readStorage();
  storage[String(dealId)] = extras;
  writeStorage(storage);
};
