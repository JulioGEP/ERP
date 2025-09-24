export type SessionManualState = 'active' | 'suspended' | 'cancelled' | 'finalized';
export type SessionAutomaticState = 'borrador' | 'planificado' | 'confirmado';
export type SessionDisplayState =
  | SessionAutomaticState
  | 'suspendido'
  | 'cancelado'
  | 'finalizado';

export type SessionStateColor = {
  background: string;
  border: string;
  text: string;
};

const SESSION_MANUAL_STATE_VALUES: SessionManualState[] = [
  'active',
  'suspended',
  'cancelled',
  'finalized'
];

export const DEFAULT_SESSION_MANUAL_STATE: SessionManualState = 'active';

const parseManualState = (value: unknown): SessionManualState =>
  SESSION_MANUAL_STATE_VALUES.includes(value as SessionManualState)
    ? (value as SessionManualState)
    : DEFAULT_SESSION_MANUAL_STATE;

const hasAssignments = (values: string[]): boolean =>
  values.some((value) => value.trim().length > 0);

const sessionStateLabels: Record<SessionDisplayState, string> = {
  borrador: 'Borrador',
  planificado: 'Planificado',
  confirmado: 'Confirmado',
  suspendido: 'Suspendido',
  cancelado: 'Cancelado',
  finalizado: 'Finalizado'
};

const sessionStateColors: Record<SessionDisplayState, SessionStateColor> = {
  borrador: { background: '#f3f4f6', border: '#e0e3e9', text: '#374151' },
  planificado: { background: '#edf7f1', border: '#cfe7da', text: '#2f5d3a' },
  confirmado: { background: '#e3f5ea', border: '#b8e5c6', text: '#1f5131' },
  suspendido: { background: '#fff6e5', border: '#ffe0a6', text: '#6c4a0c' },
  cancelado: { background: '#fdecef', border: '#f5b6c0', text: '#7d1f2b' },
  finalizado: { background: '#e6f0fb', border: '#bfd5f6', text: '#1f407a' }
};

export const getSessionAutomaticState = (
  session: Pick<CalendarEvent, 'trainers' | 'mobileUnits'>
): SessionAutomaticState => {
  const hasTrainers = hasAssignments(session.trainers);
  const hasMobileUnits = hasAssignments(session.mobileUnits);

  if (hasTrainers && hasMobileUnits) {
    return 'planificado';
  }

  return 'borrador';
};

export const getSessionDisplayState = (
  session: Pick<CalendarEvent, 'manualState' | 'trainers' | 'mobileUnits'>
): SessionDisplayState => {
  switch (session.manualState) {
    case 'suspended':
      return 'suspendido';
    case 'cancelled':
      return 'cancelado';
    case 'finalized':
      return 'finalizado';
    case 'active':
    default:
      return getSessionAutomaticState(session);
  }
};

export const getSessionStateLabel = (state: SessionDisplayState): string => sessionStateLabels[state];

export const getSessionStateColors = (state: SessionDisplayState): SessionStateColor =>
  sessionStateColors[state];

export interface CalendarEvent {
  id: string;
  dealId: number;
  dealTitle: string;
  clientName: string | null;
  dealProductId: number;
  productId: number | null;
  productName: string;
  sessionIndex: number;
  start: string;
  end: string;
  attendees: number | null;
  sede: string | null;
  address: string | null;
  trainers: string[];
  mobileUnits: string[];
  formations: string[];
  fundae: string | null;
  caes: string | null;
  hotelPernocta: string | null;
  logisticsInfo: string | null;
  manualState: SessionManualState;
}

const STORAGE_KEY = 'erp-calendar-events-v1';

const isBrowser = typeof window !== 'undefined';

type StoredCalendarEvent = Partial<CalendarEvent> & { id: string; dealId: number };

const isStoredCalendarEvent = (event: unknown): event is StoredCalendarEvent => {
  if (!event || typeof event !== 'object') {
    return false;
  }

  const candidate = event as { id?: unknown; dealId?: unknown };
  return typeof candidate.id === 'string' && typeof candidate.dealId === 'number';
};

const hasValidDateTime = (value: string | null | undefined): value is string => {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return false;
  }

  const timestamp = Date.parse(trimmed);
  return Number.isFinite(timestamp);
};

const sanitizeCalendarEvent = (event: StoredCalendarEvent): CalendarEvent => {
  const parseString = (value: unknown, fallback = ''): string =>
    typeof value === 'string' ? value : fallback;

  const parseOptionalString = (value: unknown): string | null => {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const parseNumber = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

  const parseOptionalNumber = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

  const sanitizeStringArray = (input: unknown): string[] => {
    if (!Array.isArray(input)) {
      return [];
    }

    const filtered = input
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value) => value.length > 0);

    return Array.from(new Set(filtered));
  };

  const trainers = sanitizeStringArray(event.trainers);

  const storedMobileUnits = sanitizeStringArray((event as { mobileUnits?: unknown }).mobileUnits);
  let mobileUnits = storedMobileUnits;

  if (mobileUnits.length === 0) {
    const legacyMobileUnit = (event as { mobileUnit?: unknown }).mobileUnit;

    if (typeof legacyMobileUnit === 'string') {
      const trimmed = legacyMobileUnit.trim();
      if (trimmed.length > 0) {
        mobileUnits = [trimmed];
      }
    }
  }

  return {
    id: event.id,
    dealId: event.dealId,
    dealTitle: parseString(event.dealTitle),
    clientName: parseOptionalString((event as { clientName?: unknown }).clientName),
    dealProductId: parseNumber(event.dealProductId, 0),
    productId: parseOptionalNumber(event.productId),
    productName: parseString(event.productName),
    sessionIndex: parseNumber(event.sessionIndex, 0),
    start: parseString(event.start),
    end: parseString(event.end),
    attendees: parseOptionalNumber(event.attendees),
    sede: parseOptionalString(event.sede),
    address: parseOptionalString(event.address),
    trainers,
    mobileUnits,
    formations: sanitizeStringArray((event as { formations?: unknown }).formations),
    fundae: parseOptionalString((event as { fundae?: unknown }).fundae),
    caes: parseOptionalString((event as { caes?: unknown }).caes),
    hotelPernocta: parseOptionalString((event as { hotelPernocta?: unknown }).hotelPernocta),
    logisticsInfo: parseOptionalString(event.logisticsInfo),
    manualState: parseManualState((event as { manualState?: unknown }).manualState)
  };
};

const isCompleteCalendarEvent = (event: CalendarEvent): boolean => {
  if (!hasValidDateTime(event.start) || !hasValidDateTime(event.end)) {
    return false;
  }

  const startTimestamp = Date.parse(event.start);
  const endTimestamp = Date.parse(event.end);

  if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp)) {
    return false;
  }

  return startTimestamp <= endTimestamp;
};

export const loadCalendarEvents = (): CalendarEvent[] => {
  if (!isBrowser) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return (parsed as unknown[])
      .filter(isStoredCalendarEvent)
      .map(sanitizeCalendarEvent)
      .filter(isCompleteCalendarEvent);
  } catch (error) {
    console.error('No se pudieron cargar los eventos del calendario desde el almacenamiento local', error);
    return [];
  }
};

export const persistCalendarEvents = (events: CalendarEvent[]) => {
  if (!isBrowser) {
    return;
  }

  try {
    const sanitizedEvents = events.filter(isCompleteCalendarEvent);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizedEvents));
  } catch (error) {
    console.error('No se pudieron guardar los eventos del calendario en el almacenamiento local', error);
  }
};
