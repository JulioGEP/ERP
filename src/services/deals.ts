export interface DealRecord {
  id: number;
  title: string;
  clientId: number | null;
  clientName: string | null;
  sede: string | null;
  formations: string[];
}

interface DealsResponse {
  deals: DealRecord[];
}

export const fetchDeals = async (): Promise<DealRecord[]> => {
  const response = await fetch('/.netlify/functions/deals');

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'No se pudo obtener la lista de presupuestos.');
  }

  const payload = (await response.json()) as DealsResponse;
  return payload.deals ?? [];
};
