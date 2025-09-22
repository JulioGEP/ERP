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
}

const STORAGE_KEY = 'erp-calendar-events-v1';

const isBrowser = typeof window !== 'undefined';

export const loadCalendarEvents = (): CalendarEvent[] => {
  if (!isBrowser) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as CalendarEvent[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((event) => typeof event?.id === 'string' && typeof event?.dealId === 'number');
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
