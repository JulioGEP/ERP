export interface CalendarEvent {
  id: string;
  dealId: number;
  dealTitle: string;
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
  mobileUnit: string | null;
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

  const trainers = Array.isArray(event.trainers)
    ? Array.from(
        new Set(
          event.trainers
            .map((trainer) => (typeof trainer === 'string' ? trainer.trim() : ''))
            .filter((trainer) => trainer.length > 0)
        )
      )
    : [];

  return {
    id: event.id,
    dealId: event.dealId,
    dealTitle: parseString(event.dealTitle),
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
    mobileUnit: parseOptionalString(event.mobileUnit),
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
