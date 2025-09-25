import { URL } from 'node:url';

const BASE_URL = process.env.PIPEDRIVE_BASE_URL;
const API_TOKEN = process.env.PIPEDRIVE_API_TOKEN;

if (!BASE_URL) {
  throw new Error('PIPEDRIVE_BASE_URL environment variable is required');
}

if (!API_TOKEN) {
  throw new Error('PIPEDRIVE_API_TOKEN environment variable is required');
}

export interface PipedriveEntity {
  id: number;
  [key: string]: unknown;
}

export interface PipedriveDeal extends PipedriveEntity {
  org_id: number | null;
  person_id: number | null;
  pipeline_id: number | null;
  status?: string | null;
  stage_id?: number | null;
}

export interface PipedriveOrganization extends PipedriveEntity {
  name?: string | null;
  address?: string | null;
}

export interface PipedrivePerson extends PipedriveEntity {
  org_id?: number | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: unknown;
  phone?: unknown;
}

export interface PipedriveDealProduct {
  id: number;
  quantity: number | string | null;
  item_price?: number | string | null;
  product?: {
    code?: string | null;
    name?: string | null;
  } | null;
}

export interface PipedriveNote extends PipedriveEntity {
  content?: string | null;
  deal_id?: number | null;
  update_time?: string | null;
  add_time?: string | null;
}

export interface PipedriveFile extends PipedriveEntity {
  deal_id?: number | null;
  name?: string | null;
  url?: string | null;
  file_url?: string | null;
  add_time?: string | null;
  update_time?: string | null;
}

interface PipedriveListResponse<T> {
  data: T[] | null;
}

interface PipedriveItemResponse<T> {
  data: T | null;
}

class PipedriveClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    this.token = token;
  }

  private buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>) {
    const url = new URL(path.replace(/^\//, ''), this.baseUrl);
    url.searchParams.set('api_token', this.token);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      });
    }

    return url;
  }

  private async request<T>(path: string, params?: Record<string, string | number | boolean | undefined>) {
    const url = this.buildUrl(path, params);
    const response = await fetch(url);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Pipedrive request failed: ${response.status} ${response.statusText} - ${text}`);
    }

    const json = (await response.json()) as PipedriveItemResponse<T> | PipedriveListResponse<T>;
    if ('data' in json) {
      return (json.data ?? (Array.isArray(json.data) ? [] : null)) as T;
    }

    return json as unknown as T;
  }

  async getDeal(dealId: number): Promise<PipedriveDeal> {
    const data = await this.request<PipedriveDeal>(`deals/${dealId}`);
    if (!data) {
      throw new Error(`Deal ${dealId} not found in Pipedrive`);
    }

    return data;
  }

  async getOrganization(organizationId: number): Promise<PipedriveOrganization> {
    const data = await this.request<PipedriveOrganization>(`organizations/${organizationId}`);
    if (!data) {
      throw new Error(`Organization ${organizationId} not found in Pipedrive`);
    }

    return data;
  }

  async getPerson(personId: number): Promise<PipedrivePerson> {
    const data = await this.request<PipedrivePerson>(`persons/${personId}`);
    if (!data) {
      throw new Error(`Person ${personId} not found in Pipedrive`);
    }

    return data;
  }

  async getDealProducts(dealId: number): Promise<PipedriveDealProduct[]> {
    const data = await this.request<PipedriveDealProduct[]>(`deals/${dealId}/products`);
    return Array.isArray(data) ? data : [];
  }

  async getDealNotes(dealId: number): Promise<PipedriveNote[]> {
    const data = await this.request<PipedriveNote[]>('notes', { deal_id: dealId });
    return Array.isArray(data) ? data : [];
  }

  async getDealFiles(dealId: number): Promise<PipedriveFile[]> {
    const data = await this.request<PipedriveFile[]>('files', { deal_id: dealId });
    return Array.isArray(data) ? data : [];
  }
}

export const pipedriveClient = new PipedriveClient(BASE_URL, API_TOKEN);

export type {
  PipedriveDeal as Deal,
  PipedriveOrganization as Organization,
  PipedrivePerson as Person,
  PipedriveDealProduct as DealProduct,
  PipedriveNote as Note,
  PipedriveFile as File
};
