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
    logisticsInfo: parseOptionalString(event.logisticsInfo)
  };
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

    return (parsed as unknown[]).filter(isStoredCalendarEvent).map(sanitizeCalendarEvent);
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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch (error) {
    console.error('No se pudieron guardar los eventos del calendario en el almacenamiento local', error);
  }
};
