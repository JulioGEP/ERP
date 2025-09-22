import { DealRecord } from './deals';

export type FilterKey =
  | 'id'
  | 'wonDate'
  | 'title'
  | 'clientName'
  | 'pipelineName'
  | 'sede'
  | 'address'
  | 'caes'
  | 'fundae'
  | 'hotelPernocta'
  | 'formations'
  | 'trainingProducts'
  | 'extraProducts'
  | 'notes'
  | 'attachments';

export type DealsFilters = Record<FilterKey, string>;

export interface FilterDefinition {
  key: FilterKey;
  label: string;
  placeholder?: string;
}

export const filterDefinitions: FilterDefinition[] = [
  { key: 'id', label: 'Presupuesto', placeholder: 'Ej. 1234' },
  { key: 'wonDate', label: 'Fecha de ganado', placeholder: 'Ej. 2023-05-15' },
  { key: 'title', label: 'Título', placeholder: 'Busca por título' },
  { key: 'clientName', label: 'Cliente', placeholder: 'Nombre de la organización' },
  { key: 'pipelineName', label: 'Tipo de formación', placeholder: 'Embudo o tipo' },
  { key: 'sede', label: 'Sede', placeholder: 'Nombre o ciudad de la sede' },
  { key: 'address', label: 'Dirección', placeholder: 'Dirección de la formación' },
  { key: 'caes', label: 'CAES', placeholder: 'Información CAES' },
  { key: 'fundae', label: 'FUNDAE', placeholder: 'Código o enlace' },
  { key: 'hotelPernocta', label: 'Hotel y pernocta', placeholder: 'Requisitos de alojamiento' },
  { key: 'formations', label: 'Formaciones', placeholder: 'Formaciones vinculadas' },
  { key: 'trainingProducts', label: 'Productos de formación', placeholder: 'Nombre, código o horas' },
  { key: 'extraProducts', label: 'Productos extras', placeholder: 'Servicios adicionales' },
  { key: 'notes', label: 'Notas', placeholder: 'Contenido de notas' },
  { key: 'attachments', label: 'Adjuntos', placeholder: 'Nombre de documento' }
];

export const createEmptyFilters = (): DealsFilters =>
  filterDefinitions.reduce((accumulator, definition) => {
    accumulator[definition.key] = '';
    return accumulator;
  }, {} as DealsFilters);

export const normaliseText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');

export const fallbackClientName = 'Sin organización asociada';
export const fallbackSede = 'Sin sede definida';
export const fallbackFormationsLabel = 'Sin formaciones form-';

const dealDateFormatter = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'medium'
});

export const formatDealDate = (value: string | null): string => {
  if (!value) {
    return 'Sin fecha';
  }

  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return value;
  }

  return dealDateFormatter.format(new Date(timestamp));
};

export const getDealFilterFieldValue = (deal: DealRecord, key: FilterKey): string => {
  switch (key) {
    case 'id':
      return String(deal.id);
    case 'wonDate':
      return `${deal.wonDate ?? ''} ${formatDealDate(deal.wonDate)}`;
    case 'title':
      return deal.title ?? '';
    case 'clientName':
      return deal.clientName ?? fallbackClientName;
    case 'pipelineName':
      return deal.pipelineName ?? '';
    case 'sede':
      return deal.sede ?? fallbackSede;
    case 'address':
      return deal.address ?? '';
    case 'caes':
      return deal.caes ?? '';
    case 'fundae':
      return deal.fundae ?? '';
    case 'hotelPernocta':
      return deal.hotelPernocta ?? '';
    case 'formations':
      return deal.formations.length > 0 ? deal.formations.join(' ') : fallbackFormationsLabel;
    case 'trainingProducts':
      return deal.trainingProducts
        .map((product) =>
          [
            product.name,
            product.code ?? '',
            product.recommendedHours != null ? String(product.recommendedHours) : '',
            product.recommendedHoursRaw ?? ''
          ].join(' ')
        )
        .join(' ');
    case 'extraProducts':
      return deal.extraProducts
        .map((product) =>
          [
            product.name,
            product.code ?? '',
            Number.isFinite(product.quantity) ? String(product.quantity) : '',
            product.notes.map((note) => note.content).join(' ')
          ].join(' ')
        )
        .join(' ');
    case 'notes': {
      const dealNotes = deal.notes.map((note) => note.content);
      const productNotes = [
        ...deal.trainingProducts.flatMap((product) => product.notes.map((note) => note.content)),
        ...deal.extraProducts.flatMap((product) => product.notes.map((note) => note.content))
      ];
      return [...dealNotes, ...productNotes].join(' ');
    }
    case 'attachments': {
      const dealAttachments = deal.attachments.map((attachment) => attachment.name);
      const productAttachments = [
        ...deal.trainingProducts.flatMap((product) => product.attachments.map((attachment) => attachment.name)),
        ...deal.extraProducts.flatMap((product) => product.attachments.map((attachment) => attachment.name))
      ];
      return [...dealAttachments, ...productAttachments].join(' ');
    }
    default:
      return '';
  }
};

export const buildDealFilterValues = (deal: DealRecord): Record<FilterKey, string> => {
  const values = createEmptyFilters();
  (Object.keys(values) as FilterKey[]).forEach((key) => {
    values[key] = getDealFilterFieldValue(deal, key);
  });
  return values;
};

export type NormalizedFilter = [FilterKey, string];

export const buildNormalizedFilters = (filters: DealsFilters): NormalizedFilter[] =>
  (Object.entries(filters) as [FilterKey, string][]) 
    .map(([key, value]) => [key, value.trim()] as [FilterKey, string])
    .filter(([, value]) => value.length > 0)
    .map(([key, value]) => [key, normaliseText(value)] as [FilterKey, string]);
