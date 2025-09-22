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

export interface DealRecord {
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
  trainingProducts: DealProduct[];
  extraProducts: DealProduct[];
  notes: DealNote[];
  attachments: DealAttachment[];
}

interface DealsResponse {
  deals: DealRecord[];
}

interface DealResponse {
  deal?: DealRecord | null;
  message?: string;
}

const parseErrorMessage = async (response: Response) => {
  try {
    const payload = (await response.json()) as { message?: string };
    return payload.message ?? 'No se pudo obtener la lista de presupuestos.';
  } catch (error) {
    const text = await response.text();
    return text || 'No se pudo obtener la lista de presupuestos.';
  }
};

export const fetchDeals = async (): Promise<DealRecord[]> => {
  const response = await fetch('/.netlify/functions/deals');

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const payload = (await response.json()) as DealsResponse;
  return payload.deals ?? [];
};

export const fetchDealById = async (dealId: number): Promise<DealRecord> => {
  const response = await fetch(`/.netlify/functions/deals?dealId=${dealId}`);

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const payload = (await response.json()) as DealResponse;

  if (!payload.deal) {
    throw new Error(payload.message || 'No se encontró el presupuesto solicitado.');
  }

  return payload.deal;
};
