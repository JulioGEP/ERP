import type { Deal, DealProduct, Organization, Person } from './pipedriveClient';

export const ORGANIZATION_CUSTOM_FIELDS = {
  cif: '6d39d015a33921753410c1bab0b067ca93b8cf2c',
  phone: 'b4379db06dfbe0758d84c2c2dd45ef04fa093b6d'
} as const;

export const DEAL_CUSTOM_FIELDS = {
  hours: '38f11c8876ecde803a027fbf3c9041fda2ae7eb7',
  dealDirection: '8b2a7570f5ba8aa4754f061cd9dc92fd778376a7',
  site: '676d6bd51e52999c582c01f67c99a35ed30bf6ae',
  caes: 'e1971bf3a21d48737b682bf8d864ddc5eb15a351',
  fundae: '245d60d4d18aec40ba888998ef92e5d00e494583',
  hotelNight: 'c3a6daf8eb5b4e59c3c07cda8e01f43439101269'
} as const;

export type NullableString = string | null;

export function extractOrganizationPayload(organization: Organization) {
  return {
    pipedriveId: organization.id,
    name: (organization.name ?? null) as NullableString,
    cif: (organization[ORGANIZATION_CUSTOM_FIELDS.cif] ?? null) as NullableString,
    phone: (organization[ORGANIZATION_CUSTOM_FIELDS.phone] ?? null) as NullableString,
    address: (organization.address ?? null) as NullableString
  };
}

export function extractPersonPayload(person: Person, orgId: number | null) {
  return {
    pipedriveId: person.id,
    orgId,
    firstName: (person.first_name ?? null) as NullableString,
    lastName: (person.last_name ?? null) as NullableString,
    email: extractPrimaryValue(person.email),
    phone: extractPrimaryValue(person.phone)
  };
}

export function extractDealPayload(deal: Deal) {
  return {
    pipedriveId: deal.id,
    orgPipedriveId: (deal.org_id ?? null) as number | null,
    personPipedriveId: (deal.person_id ?? null) as number | null,
    pipelineId: deal.pipeline_id ?? null,
    hours: (deal[DEAL_CUSTOM_FIELDS.hours] ?? null) as NullableString,
    direction: (deal[DEAL_CUSTOM_FIELDS.dealDirection] ?? null) as NullableString,
    site: (deal[DEAL_CUSTOM_FIELDS.site] ?? null) as NullableString,
    caes: parseBoolean(deal[DEAL_CUSTOM_FIELDS.caes]),
    fundae: parseBoolean(deal[DEAL_CUSTOM_FIELDS.fundae]),
    hotelNight: parseBoolean(deal[DEAL_CUSTOM_FIELDS.hotelNight]),
    status: extractDealStatus(deal)
  };
}

export function extractDealStatus(deal: Deal): NullableString {
  if (deal.status && typeof deal.status === 'string' && deal.status.trim().length > 0) {
    return deal.status;
  }

  if (deal.stage_id !== undefined && deal.stage_id !== null) {
    return String(deal.stage_id);
  }

  return null;
}

export function extractPrimaryValue(value: unknown): NullableString {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return value.trim() || null;
  }

  if (Array.isArray(value)) {
    const primary = value.find((item) => isPrimaryItem(item));
    const fallback = value.find((item) => getItemValue(item));
    const selected = primary ?? fallback;
    const selectedValue = getItemValue(selected);
    return selectedValue ? selectedValue.trim() : null;
  }

  if (typeof value === 'object' && value !== null) {
    const possibleValue = getItemValue(value);
    if (possibleValue) {
      return possibleValue.trim();
    }
  }

  return null;
}

function isPrimaryItem(value: unknown): boolean {
  if (typeof value === 'object' && value !== null && 'primary' in value) {
    const primaryValue = (value as { primary?: unknown }).primary;
    return Boolean(parseBoolean(primaryValue));
  }

  return false;
}

function getItemValue(value: unknown): string | null {
  if (typeof value === 'object' && value !== null && 'value' in value) {
    const raw = (value as { value?: unknown }).value;
    return typeof raw === 'string' ? raw : raw != null ? String(raw) : null;
  }

  if (typeof value === 'string') {
    return value;
  }

  return null;
}

export function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }

  if (Array.isArray(value)) {
    return value.some((item) => parseBoolean(item));
  }

  if (value && typeof value === 'object') {
    if ('value' in value) {
      return parseBoolean((value as { value?: unknown }).value);
    }

    if ('checked' in value) {
      return parseBoolean((value as { checked?: unknown }).checked);
    }
  }

  return false;
}

export interface DealProductsClassification {
  trainingNames: string[];
  extraNames: string[];
  sessionsNeeded: number;
}

export function classifyDealProducts(products: DealProduct[]): DealProductsClassification {
  const trainingNames: string[] = [];
  const extraNames: string[] = [];
  let sessionsNeeded = 0;

  products.forEach((product) => {
    const code = product.product?.code ?? '';
    const name = product.product?.name ?? null;
    const quantity = Number(product.quantity ?? 0);
    const isTraining = typeof code === 'string' && code.toLowerCase().includes('form-');

    if (isTraining) {
      sessionsNeeded += Number.isFinite(quantity) ? quantity : 0;
      if (name) {
        trainingNames.push(name);
      }
    } else if (name) {
      extraNames.push(name);
    }
  });

  return {
    trainingNames,
    extraNames,
    sessionsNeeded
  };
}

export function buildTrainingSummary(classification: DealProductsClassification) {
  return classification.trainingNames.join(', ');
}

export function buildExtrasSummary(classification: DealProductsClassification) {
  return classification.extraNames.join(', ');
}

export function calculateSessionsNeeded(products: DealProduct[]): number {
  return classifyDealProducts(products).sessionsNeeded;
}
