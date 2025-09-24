export type CalendarEventStatus = 'activo' | 'suspendido' | 'cancelado' | 'finalizado';

export type ActiveEventPhase = 'pendiente' | 'borrador' | 'planificado' | 'confirmado';

export type SessionVisualState =
  | 'pending'
  | 'draft'
  | 'planned'
  | 'confirmed'
  | 'suspended'
  | 'cancelled'
  | 'finalized';

export interface SessionStateDescriptor {
  status: CalendarEventStatus;
  phase: ActiveEventPhase | null;
  visualState: SessionVisualState;
  label: string;
}

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
  status: CalendarEventStatus;
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

const isValidStatus = (value: unknown): value is CalendarEventStatus =>
  value === 'activo' || value === 'suspendido' || value === 'cancelado' || value === 'finalizado';

const parseStatus = (value: unknown): CalendarEventStatus =>
  isValidStatus(value) ? value : 'activo';

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
    status: parseStatus((event as { status?: unknown }).status)
  };
};

const hasValue = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const hasAnyValue = (values: unknown): values is string[] =>
  Array.isArray(values) && values.some((item) => hasValue(item));

export const deriveActivePhase = (options: {
  start?: string | null;
  end?: string | null;
  trainers?: string[];
  mobileUnits?: string[];
}): ActiveEventPhase => {
  const hasStart = hasValue(options.start);
  const hasEnd = hasValue(options.end);

  if (!hasStart || !hasEnd) {
    return 'pendiente';
  }

  const hasTrainer = hasAnyValue(options.trainers ?? []);
  const hasMobileUnit = hasAnyValue(options.mobileUnits ?? []);

  if (hasTrainer && hasMobileUnit) {
    return 'planificado';
  }

  return 'borrador';
};

const visualStateFromPhase = (phase: ActiveEventPhase): SessionVisualState => {
  switch (phase) {
    case 'pendiente':
      return 'pending';
    case 'borrador':
      return 'draft';
    case 'planificado':
      return 'planned';
    case 'confirmado':
      return 'confirmed';
    default:
      return 'draft';
  }
};

const labelFromPhase = (phase: ActiveEventPhase): string => {
  switch (phase) {
    case 'pendiente':
      return 'Pendiente';
    case 'borrador':
      return 'Borrador';
    case 'planificado':
      return 'Planificado';
    case 'confirmado':
      return 'Confirmado';
    default:
      return 'Pendiente';
  }
};

export const describeSessionState = (
  status: CalendarEventStatus,
  details: { start?: string | null; end?: string | null; trainers?: string[]; mobileUnits?: string[] }
): SessionStateDescriptor => {
  if (status === 'activo') {
    const phase = deriveActivePhase(details);
    return {
      status,
      phase,
      visualState: visualStateFromPhase(phase),
      label: labelFromPhase(phase)
    } satisfies SessionStateDescriptor;
  }

  const manualMap: Record<Exclude<CalendarEventStatus, 'activo'>, { label: string; visualState: SessionVisualState }> = {
    suspendido: { label: 'Suspendido', visualState: 'suspended' },
    cancelado: { label: 'Cancelado', visualState: 'cancelled' },
    finalizado: { label: 'Finalizado', visualState: 'finalized' }
  };

  const fallback = manualMap[status];
  return { status, phase: null, visualState: fallback.visualState, label: fallback.label } satisfies SessionStateDescriptor;
};

export const describeCalendarEventState = (event: CalendarEvent): SessionStateDescriptor =>
  describeSessionState(event.status, {
    start: event.start,
    end: event.end,
    trainers: event.trainers,
    mobileUnits: event.mobileUnits
  });

export const isSessionActionRequired = (descriptor: SessionStateDescriptor): boolean =>
  descriptor.visualState === 'pending' ||
  descriptor.visualState === 'draft' ||
  descriptor.visualState === 'suspended';

export const isCalendarEventActionRequired = (event: CalendarEvent): boolean =>
  isSessionActionRequired(describeCalendarEventState(event));

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
