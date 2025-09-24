import { useCallback, useEffect, useMemo, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Badge from 'react-bootstrap/Badge';
import Button from 'react-bootstrap/Button';
import Col from 'react-bootstrap/Col';
import Collapse from 'react-bootstrap/Collapse';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import ListGroup from 'react-bootstrap/ListGroup';
import Modal from 'react-bootstrap/Modal';
import Row from 'react-bootstrap/Row';
import Spinner from 'react-bootstrap/Spinner';
import Stack from 'react-bootstrap/Stack';
import Table from 'react-bootstrap/Table';
import {
  CalendarEvent,
  DEFAULT_SESSION_MANUAL_STATE,
  SessionManualState,
  getSessionDisplayState,
  getSessionStateColors,
  getSessionStateLabel
} from '../../services/calendar';
import {
  DealAttachment,
  DealNote,
  DealRecord,
  buildDealFormationLabels,
  countSessionsForProduct,
  splitDealProductsByCode
} from '../../services/deals';
import {
  fetchDealExtras,
  loadDealExtras,
  persistDealExtras,
  StoredDealDocument,
  StoredDealNote
} from '../../services/dealExtras';

interface DealDetailModalProps {
  show: boolean;
  deal: DealRecord;
  events: CalendarEvent[];
  onHide: () => void;
  onUpdateSchedule: (dealId: number, events: CalendarEvent[]) => void;
  onDealRefetch: () => Promise<void> | void;
  isLoading: boolean;
}

interface SessionFormEntry {
  key: string;
  dealProductId: number;
  productId: number | null;
  productName: string;
  recommendedHours: number | null;
  recommendedHoursRaw: string | null;
  sessionIndex: number;
  start: string;
  end: string;
  endTouched: boolean;
  attendees: string;
  sede: string;
  address: string;
  trainers: string[];
  mobileUnits: string[];
  manualState: SessionManualState;
  logisticsInfo: string;
}

type DisplayNote = DealNote & { shareWithTrainer?: boolean | null };
type DisplayAttachment = DealAttachment;
type ShareWithTrainerOption = 'yes' | 'no';

const extractNotePreview = (content: string): { preview: string; truncated: boolean } => {
  const trimmed = content.trim();

  if (!trimmed) {
    return { preview: 'Sin contenido', truncated: false };
  }

  const sentenceSeparator = /(?<=[.!?])\s+/u;
  const sentences = trimmed.split(sentenceSeparator);

  if (sentences.length > 1) {
    return { preview: sentences[0].trim(), truncated: true };
  }

  const firstLineBreak = trimmed.indexOf('\n');
  if (firstLineBreak >= 0) {
    return { preview: trimmed.slice(0, firstLineBreak).trim(), truncated: true };
  }

  return { preview: trimmed, truncated: false };
};

const generateId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const toDateTimeLocalString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const formatDateTimeInput = (iso: string | null | undefined): string => {
  if (!iso) {
    return '';
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return toDateTimeLocalString(date);
};

const toIsoString = (value: string): string | null => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
};

const computeEndFromStart = (start: string, hours: number | null): string => {
  if (!start || hours == null) {
    return '';
  }

  const date = new Date(start);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const milliseconds = hours * 60 * 60 * 1000;
  date.setTime(date.getTime() + milliseconds);
  return toDateTimeLocalString(date);
};

const computeSessionScheduleWarning = (start: string, end: string): string | null => {
  if (!start || !end) {
    return null;
  }

  const startDate = new Date(start);
  const endDate = new Date(end);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null;
  }

  if (endDate.getTime() < startDate.getTime()) {
    return 'La fecha de fin no puede ser anterior a la fecha de inicio. Por favor avisa al comercial.';
  }

  return null;
};

const formatDateLabel = (iso: string | null) => {
  if (!iso) {
    return 'Sin fecha';
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'Sin fecha';
  }

  return date.toLocaleString();
};

const resolveProductName = (
  dealProductId: number | null,
  productId: number | null,
  productMapByDealId: Map<number, string>,
  productMapByProductId: Map<number, string>
) => {
  if (dealProductId != null && productMapByDealId.has(dealProductId)) {
    return productMapByDealId.get(dealProductId) ?? null;
  }

  if (productId != null && productMapByProductId.has(productId)) {
    return productMapByProductId.get(productId) ?? null;
  }

  return null;
};

const sessionTrainerOptions = Array.from({ length: 10 }, (_, index) => `Bombero ${index + 1}`);

const mobileUnitOptions = [
  'Pickup',
  'Pickup con remolque',
  'Furgoneta',
  'Furgoneta con remolque',
  'Camión 1',
  'Camión 2'
];

const manualStateOptions: { value: SessionManualState; label: string }[] = [
  { value: 'active', label: 'Activo' },
  { value: 'suspended', label: 'Suspendido' },
  { value: 'cancelled', label: 'Cancelado' },
  { value: 'finalized', label: 'Finalizado' }
];

const sanitizeSelectionList = (values: string[]): string[] =>
  Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)));

const normalizeSelectionValue = (value: string): string => value.trim();

const sanitizeOptionalDealText = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const getDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toValidDate = (input: string | null | undefined): Date | null => {
  if (!input) {
    return null;
  }

  const candidate = new Date(input);
  if (Number.isNaN(candidate.getTime())) {
    return null;
  }

  return candidate;
};

const computeDateKeysInRange = (
  startInput: string | null | undefined,
  endInput: string | null | undefined
): string[] => {
  const startDate = toValidDate(startInput);

  if (!startDate) {
    return [];
  }

  const endDate = toValidDate(endInput);
  const effectiveEnd = endDate && endDate.getTime() >= startDate.getTime() ? endDate : startDate;

  const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endDay = new Date(effectiveEnd.getFullYear(), effectiveEnd.getMonth(), effectiveEnd.getDate());

  const keys: string[] = [];
  for (let current = new Date(startDay); current.getTime() <= endDay.getTime(); current.setDate(current.getDate() + 1)) {
    keys.push(getDateKey(current));
  }

  return keys;
};

interface BlockedSelectionSets {
  trainers: Set<string>;
  mobileUnits: Set<string>;
}

const createEmptyBlockedSelectionSets = (): BlockedSelectionSets => ({
  trainers: new Set<string>(),
  mobileUnits: new Set<string>()
});

const addBlockedValues = (values: string[], target: Set<string>) => {
  sanitizeSelectionList(values).forEach((value) => {
    const normalized = normalizeSelectionValue(value);
    if (normalized.length > 0) {
      target.add(normalized);
    }
  });
};

const computeBlockedSelectionSetsForSession = (
  session: SessionFormEntry,
  allSessions: SessionFormEntry[],
  events: CalendarEvent[],
  dealId: number
): BlockedSelectionSets => {
  const blocked = createEmptyBlockedSelectionSets();
  const sessionDateKeys = computeDateKeysInRange(session.start, session.end);

  if (sessionDateKeys.length === 0) {
    return blocked;
  }

  const sessionDateKeySet = new Set(sessionDateKeys);

  events.forEach((event) => {
    if (event.manualState !== 'active') {
      return;
    }

    const eventDateKeys = computeDateKeysInRange(event.start, event.end);
    if (eventDateKeys.length === 0) {
      return;
    }

    const hasIntersection = eventDateKeys.some((dateKey) => sessionDateKeySet.has(dateKey));
    if (!hasIntersection) {
      return;
    }

    const isSameSession =
      event.dealId === dealId &&
      event.dealProductId === session.dealProductId &&
      event.sessionIndex === session.sessionIndex;

    if (isSameSession) {
      return;
    }

    addBlockedValues(event.trainers, blocked.trainers);
    addBlockedValues(event.mobileUnits, blocked.mobileUnits);
  });

  allSessions.forEach((otherSession) => {
    if (otherSession.key === session.key) {
      return;
    }

    if (otherSession.manualState !== 'active') {
      return;
    }

    const otherDateKeys = computeDateKeysInRange(otherSession.start, otherSession.end);
    if (otherDateKeys.length === 0) {
      return;
    }

    const hasIntersection = otherDateKeys.some((dateKey) => sessionDateKeySet.has(dateKey));
    if (!hasIntersection) {
      return;
    }

    addBlockedValues(otherSession.trainers, blocked.trainers);
    addBlockedValues(otherSession.mobileUnits, blocked.mobileUnits);
  });

  return blocked;
};

const computeBlockedSelectionsBySession = (
  sessions: SessionFormEntry[],
  events: CalendarEvent[],
  dealId: number
) => {
  const map = new Map<string, BlockedSelectionSets>();

  sessions.forEach((session) => {
    map.set(session.key, computeBlockedSelectionSetsForSession(session, sessions, events, dealId));
  });

  return map;
};

const computeAvailableSelectionOptions = (
  options: string[],
  values: string[],
  currentIndex: number,
  blockedValues: Set<string> = new Set()
) => {
  return options.filter((option) => {
    const normalizedOption = normalizeSelectionValue(option);
    const currentValue = normalizeSelectionValue(values[currentIndex]);
    const isCurrentValue = currentValue === normalizedOption;

    if (!isCurrentValue && blockedValues.has(normalizedOption)) {
      return false;
    }

    if (isCurrentValue) {
      return true;
    }

    return values.every((value, index) => {
      if (index === currentIndex) {
        return true;
      }

      return normalizeSelectionValue(value) !== normalizedOption;
    });
  });
};

const hasAvailableSelectionOption = (
  options: string[],
  values: string[],
  blockedValues: Set<string> = new Set()
) => {
  const normalizedOptions = options.map((option) => normalizeSelectionValue(option));
  const usedValues = new Set(
    values
      .map((value) => normalizeSelectionValue(value))
      .filter((value) => value.length > 0 && normalizedOptions.includes(value))
  );

  return normalizedOptions.some((option) => {
    if (blockedValues.has(option) && !usedValues.has(option)) {
      return false;
    }

    return !usedValues.has(option);
  });
};

const extractStoredSelectionList = (input: unknown): string[] => {
  if (!Array.isArray(input)) {
    return [];
  }

  const rawValues = input
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value.length > 0);

  return sanitizeSelectionList(rawValues);
};

const appendSelectionSlot = (items: string[]): string[] => {
  if (items.length === 0) {
    return [''];
  }

  return items[items.length - 1].trim().length > 0 ? [...items, ''] : items;
};

const removeSelectionSlot = (items: string[], index: number): string[] => {
  const next = items.filter((_, itemIndex) => itemIndex !== index);
  return next.length > 0 ? next : [''];
};

const updateSelectionSlot = (items: string[], index: number, value: string): string[] => {
  const next = [...items];

  while (next.length <= index) {
    next.push('');
  }

  next[index] = value;
  return next;
};

const createScheduleSnapshot = (
  sessions: SessionFormEntry[],
  caes: string,
  fundae: string,
  hotelPernocta: string
) => {
  const normalizedSessions = sessions.map((session) => ({
    key: session.key,
    dealProductId: session.dealProductId,
    productId: session.productId,
    productName: session.productName,
    recommendedHours: session.recommendedHours,
    recommendedHoursRaw: session.recommendedHoursRaw,
    sessionIndex: session.sessionIndex,
    start: session.start,
    end: session.end,
    endTouched: session.endTouched,
    attendees: session.attendees,
    sede: session.sede,
    address: session.address,
    trainers: session.trainers,
    mobileUnits: session.mobileUnits,
    manualState: session.manualState,
    logisticsInfo: session.logisticsInfo
  }));

  return JSON.stringify({
    sessions: normalizedSessions,
    caes,
    fundae,
    hotelPernocta
  });
};

const DealDetailModal = ({
  show,
  deal,
  events,
  onHide,
  onUpdateSchedule,
  onDealRefetch,
  isLoading
}: DealDetailModalProps) => {
  const [localNotes, setLocalNotes] = useState<StoredDealNote[]>([]);
  const [localDocuments, setLocalDocuments] = useState<StoredDealDocument[]>([]);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteModalMode, setNoteModalMode] = useState<'create' | 'view' | 'edit'>('create');
  const [activeNote, setActiveNote] = useState<DisplayNote | null>(null);
  const [noteText, setNoteText] = useState('');
  const [shareWithTrainer, setShareWithTrainer] = useState<ShareWithTrainerOption>('no');
  const [noteModalInitialText, setNoteModalInitialText] = useState('');
  const [noteModalInitialShare, setNoteModalInitialShare] = useState<ShareWithTrainerOption>('no');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [showNoteUnsavedConfirm, setShowNoteUnsavedConfirm] = useState(false);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [documentName, setDocumentName] = useState('');
  const [documentUrl, setDocumentUrl] = useState('');
  const [documentTarget, setDocumentTarget] = useState('general');
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<DisplayAttachment | null>(null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);
  const [attachmentPreviewError, setAttachmentPreviewError] = useState<string | null>(null);
  const [attachmentPreviewLoading, setAttachmentPreviewLoading] = useState(false);
  const [showDocumentUnsavedConfirm, setShowDocumentUnsavedConfirm] = useState(false);
  const [showScheduleUnsavedConfirm, setShowScheduleUnsavedConfirm] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isBusy = isLoading || isRefreshing;
  const [mapVisible, setMapVisible] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [attachmentsExpanded, setAttachmentsExpanded] = useState(false);
  const [extraProductsExpanded, setExtraProductsExpanded] = useState(false);

  useEffect(() => {
    return () => {
      if (attachmentPreviewUrl) {
        URL.revokeObjectURL(attachmentPreviewUrl);
      }
    };
  }, [attachmentPreviewUrl]);

  const { trainingProducts, extraProducts } = useMemo(
    () =>
      splitDealProductsByCode({
        trainingProducts: deal.trainingProducts,
        extraProducts: deal.extraProducts
      }),
    [deal.extraProducts, deal.trainingProducts]
  );

  const formationLabels = useMemo(
    () => buildDealFormationLabels(deal.formations, trainingProducts),
    [deal.formations, trainingProducts]
  );

  const productMap = useMemo(() => {
    const byDealProductId = new Map<number, string>();
    const byProductId = new Map<number, string>();

    [...trainingProducts, ...extraProducts].forEach((product) => {
      byDealProductId.set(product.dealProductId, product.name);
      if (product.productId != null) {
        byProductId.set(product.productId, product.name);
      }
    });

    return { byDealProductId, byProductId };
  }, [extraProducts, trainingProducts]);

  useEffect(() => {
    const extras = loadDealExtras(deal.id);
    setLocalNotes(extras.notes ?? []);
    setLocalDocuments(extras.documents ?? []);
    setNoteText('');
    setDocumentName('');
    setDocumentUrl('');
    setShareWithTrainer('no');
    setActiveNote(null);
    setNoteModalMode('create');
    setNoteModalInitialText('');
    setNoteModalInitialShare('no');
    setDocumentTarget('general');
    setNoteError(null);
    setDocumentError(null);
    setShowNoteUnsavedConfirm(false);
    setShowDocumentUnsavedConfirm(false);
    setSaveFeedback(null);
    setSaveError(null);
    setNotesExpanded(false);
    setAttachmentsExpanded(false);
    setExtraProductsExpanded(false);
  }, [deal.id]);

  useEffect(() => {
    let isActive = true;

    const synchronizeExtras = async () => {
      const extras = await fetchDealExtras(deal.id);

      if (!isActive) {
        return;
      }

      setLocalNotes(extras.notes ?? []);
      setLocalDocuments(extras.documents ?? []);
    };

    void synchronizeExtras();

    return () => {
      isActive = false;
    };
  }, [deal.id]);

  const isNoteDirty =
    noteModalMode !== 'view' &&
    (noteText !== noteModalInitialText || shareWithTrainer !== noteModalInitialShare);
  const isDocumentDirty =
    documentName !== '' || documentUrl !== '' || documentTarget !== 'general';

  const closeNoteModal = useCallback(() => {
    setShowNoteModal(false);
    setShowNoteUnsavedConfirm(false);
    setNoteText('');
    setShareWithTrainer('no');
    setNoteError(null);
    setActiveNote(null);
    setNoteModalMode('create');
    setNoteModalInitialText('');
    setNoteModalInitialShare('no');
  }, []);

  const closeDocumentModal = useCallback(() => {
    setShowDocumentModal(false);
    setShowDocumentUnsavedConfirm(false);
    setDocumentName('');
    setDocumentUrl('');
    setDocumentTarget('general');
    setDocumentError(null);
  }, []);

  const handleNoteModalClose = useCallback(() => {
    if (isNoteDirty) {
      setShowNoteUnsavedConfirm(true);
      return;
    }

    closeNoteModal();
  }, [closeNoteModal, isNoteDirty]);

  const handleDocumentModalClose = useCallback(() => {
    if (isDocumentDirty) {
      setShowDocumentUnsavedConfirm(true);
      return;
    }

    closeDocumentModal();
  }, [closeDocumentModal, isDocumentDirty]);

  const eventsByKey = useMemo(() => {
    const map = new Map<string, CalendarEvent>();
    events
      .filter((eventItem) => eventItem.dealId === deal.id)
      .forEach((eventItem) => {
        const key = `${eventItem.dealProductId}-${eventItem.sessionIndex}`;
        map.set(key, eventItem);
      });
    return map;
  }, [deal.id, events]);

  const initialSessions = useMemo(() => {
    return trainingProducts.flatMap((product) => {
      const sessionsCount = countSessionsForProduct(product);
      return Array.from({ length: sessionsCount }).map((_, index) => {
        const key = `${product.dealProductId}-${index}`;
        const existingEvent = eventsByKey.get(key);
        const existingTrainers = extractStoredSelectionList(existingEvent?.trainers);
        const storedMobileUnits = existingEvent
          ? extractStoredSelectionList((existingEvent as { mobileUnits?: unknown }).mobileUnits)
          : [];
        const legacyMobileUnit = (existingEvent as { mobileUnit?: string | null })?.mobileUnit;
        const normalizedMobileUnits =
          storedMobileUnits.length > 0
            ? storedMobileUnits
            : typeof legacyMobileUnit === 'string' && legacyMobileUnit.trim().length > 0
              ? [legacyMobileUnit.trim()]
              : [];

        return {
          key,
          dealProductId: product.dealProductId,
          productId: product.productId,
          productName: product.name,
          recommendedHours: product.recommendedHours,
          recommendedHoursRaw: product.recommendedHoursRaw,
          sessionIndex: index,
          start: formatDateTimeInput(existingEvent?.start),
          end: formatDateTimeInput(existingEvent?.end),
          endTouched: Boolean(existingEvent?.end),
          attendees:
            existingEvent && existingEvent.attendees != null ? String(existingEvent.attendees) : '',
          sede: existingEvent?.sede ?? deal.sede ?? '',
          address: existingEvent?.address ?? deal.address ?? '',
          trainers: existingTrainers.length > 0 ? existingTrainers : [''],
          mobileUnits: normalizedMobileUnits.length > 0 ? normalizedMobileUnits : [''],
          logisticsInfo: existingEvent?.logisticsInfo ?? '',
          manualState: existingEvent?.manualState ?? DEFAULT_SESSION_MANUAL_STATE
        } satisfies SessionFormEntry;
      });
    });
  }, [deal.address, deal.sede, eventsByKey, trainingProducts]);

  const [sessions, setSessions] = useState<SessionFormEntry[]>(initialSessions);

  const initialGeneralAttendees = useMemo(() => {
    if (initialSessions.length === 0) {
      return '';
    }

    const [first, ...rest] = initialSessions;
    return rest.every((session) => session.attendees === first.attendees) ? first.attendees : '';
  }, [initialSessions]);

  const [generalAttendees, setGeneralAttendees] = useState(initialGeneralAttendees);
  const [sessionWarnings, setSessionWarnings] = useState<Record<string, string>>({});

  const blockedSelectionsBySession = useMemo(
    () => computeBlockedSelectionsBySession(sessions, events, deal.id),
    [sessions, events, deal.id]
  );

  const initialRecommendedHoursByProduct = useMemo(() => {
    const entries = trainingProducts.map((product) => [
      product.dealProductId,
      product.recommendedHours != null ? String(product.recommendedHours) : ''
    ]);

    return Object.fromEntries(entries) as Record<number, string>;
  }, [trainingProducts]);

  const [recommendedHoursByProduct, setRecommendedHoursByProduct] = useState(
    initialRecommendedHoursByProduct
  );
  const [generalAddress, setGeneralAddress] = useState(deal.address ?? '');
  const [caesValue, setCaesValue] = useState(deal.caes ?? '');
  const [fundaeValue, setFundaeValue] = useState(deal.fundae ?? '');
  const [hotelPernoctaValue, setHotelPernoctaValue] = useState(deal.hotelPernocta ?? '');
  const [scheduleBaseline, setScheduleBaseline] = useState(() =>
    createScheduleSnapshot(
      initialSessions,
      deal.caes ?? '',
      deal.fundae ?? '',
      deal.hotelPernocta ?? ''
    )
  );
  const currentScheduleSnapshot = useMemo(
    () => createScheduleSnapshot(sessions, caesValue, fundaeValue, hotelPernoctaValue),
    [sessions, caesValue, fundaeValue, hotelPernoctaValue]
  );
  const hasScheduleChanges = currentScheduleSnapshot !== scheduleBaseline;

  const handleScheduleModalCloseRequest = useCallback(() => {
    if (hasScheduleChanges) {
      setShowScheduleUnsavedConfirm(true);
      return;
    }

    onHide();
  }, [hasScheduleChanges, onHide]);

  const handleKeepEditingSchedule = useCallback(() => {
    setShowScheduleUnsavedConfirm(false);
  }, []);

  const handleConfirmScheduleDiscard = useCallback(() => {
    setShowScheduleUnsavedConfirm(false);
    onHide();
  }, [onHide]);

  useEffect(() => {
    setSessions(initialSessions);
    setSessionWarnings({});
  }, [initialSessions, show]);

  useEffect(() => {
    if (show) {
      setGeneralAttendees(initialGeneralAttendees);
    }
  }, [initialGeneralAttendees, show]);

  useEffect(() => {
    if (show) {
      setRecommendedHoursByProduct(initialRecommendedHoursByProduct);
    }
  }, [initialRecommendedHoursByProduct, show]);

  useEffect(() => {
    if (show) {
      setGeneralAddress(deal.address ?? '');
    }
  }, [deal.address, show]);

  useEffect(() => {
    if (show) {
      setCaesValue(deal.caes ?? '');
    }
  }, [deal.caes, show]);

  useEffect(() => {
    if (show) {
      setFundaeValue(deal.fundae ?? '');
    }
  }, [deal.fundae, show]);

  useEffect(() => {
    if (show) {
      setHotelPernoctaValue(deal.hotelPernocta ?? '');
    }
  }, [deal.hotelPernocta, show]);

  useEffect(() => {
    if (show) {
      setScheduleBaseline(
        createScheduleSnapshot(
          initialSessions,
          deal.caes ?? '',
          deal.fundae ?? '',
          deal.hotelPernocta ?? ''
        )
      );
    }
  }, [deal.caes, deal.fundae, deal.hotelPernocta, initialSessions, show]);

  const localNoteEntries: DisplayNote[] = useMemo(
    () =>
      localNotes.map((note) => ({
        id: note.id,
        content: note.content,
        createdAt: note.createdAt,
        authorName: 'Equipo de planificación',
        source: 'local',
        productId: note.productId ?? null,
        dealProductId: note.dealProductId ?? null,
        shareWithTrainer: note.shareWithTrainer ?? null
      })),
    [localNotes]
  );

  const combinedNotes: DisplayNote[] = useMemo(() => {
    const joined = [...deal.notes, ...localNoteEntries];
    return joined.sort((a, b) => {
      const left = a.createdAt ?? '';
      const right = b.createdAt ?? '';
      return right.localeCompare(left);
    });
  }, [deal.notes, localNoteEntries]);

  const localAttachmentEntries: DisplayAttachment[] = useMemo(
    () =>
      localDocuments.map((document) => ({
        id: document.id,
        name: document.name,
        url: document.url,
        downloadUrl: document.url,
        fileType: null,
        addedAt: document.createdAt,
        addedBy: 'Equipo de planificación',
        source: 'local',
        productId: document.productId ?? null,
        dealProductId: document.dealProductId ?? null
      })),
    [localDocuments]
  );

  const combinedAttachments: DisplayAttachment[] = useMemo(() => {
    const joined = [...deal.attachments, ...localAttachmentEntries];
    return joined.sort((a, b) => {
      const left = a.addedAt ?? '';
      const right = b.addedAt ?? '';
      return right.localeCompare(left);
    });
  }, [deal.attachments, localAttachmentEntries]);

  const notesCount = combinedNotes.length;
  const attachmentsCount = combinedAttachments.length;
  const extraProductsCount = extraProducts.length;

  const handleRecommendedHoursChange = (dealProductId: number, value: string) => {
    setRecommendedHoursByProduct((previous) => ({
      ...previous,
      [dealProductId]: value
    }));

    let parsedHours: number | null = null;
    if (value !== '') {
      const numericValue = Number(value);
      parsedHours = Number.isFinite(numericValue) ? numericValue : null;
    }

    setSessions((previous) =>
      previous.map((session) => {
        if (session.dealProductId !== dealProductId) {
          return session;
        }

        const updated: SessionFormEntry = {
          ...session,
          recommendedHours: parsedHours
        };

        if (!session.endTouched) {
          const computed = computeEndFromStart(session.start, parsedHours);
          updated.end = computed;
        }

        return updated;
      })
    );
  };

  const handleGeneralAddressChange = (value: string) => {
    setGeneralAddress(value);
    setSessions((previous) => previous.map((session) => ({ ...session, address: value })));
  };

  const handleGeneralAttendeesChange = (value: string) => {
    setGeneralAttendees(value);
    setSessions((previous) => previous.map((session) => ({ ...session, attendees: value })));
  };

  const applySessionWarning = useCallback((key: string, warning: string | null) => {
    setSessionWarnings((previous) => {
      if (!warning) {
        if (!(key in previous)) {
          return previous;
        }

        const { [key]: _ignored, ...rest } = previous;
        return rest;
      }

      if (previous[key] === warning) {
        return previous;
      }

      return { ...previous, [key]: warning };
    });
  }, []);

  const handleSessionStartChange = (key: string, value: string) => {
    let warning: string | null = null;

    setSessions((previous) =>
      previous.map((session) => {
        if (session.key !== key) {
          return session;
        }

        const updated: SessionFormEntry = {
          ...session,
          start: value
        };

        if (!session.endTouched) {
          const computed = computeEndFromStart(value, session.recommendedHours);
          if (computed) {
            updated.end = computed;
          }
        }

        warning = computeSessionScheduleWarning(updated.start, updated.end);

        return updated;
      })
    );

    applySessionWarning(key, warning);
  };

  const handleSessionEndChange = (key: string, value: string) => {
    let warning: string | null = null;

    setSessions((previous) =>
      previous.map((session) => {
        if (session.key !== key) {
          return session;
        }

        const updated: SessionFormEntry = {
          ...session,
          end: value,
          endTouched: value.trim().length > 0
        };

        warning = computeSessionScheduleWarning(updated.start, updated.end);

        return updated;
      })
    );

    applySessionWarning(key, warning);
  };

  const handleSessionFieldChange = (key: string, field: keyof SessionFormEntry, value: string) => {
    setSessions((previous) =>
      previous.map((session) =>
        session.key === key
          ? {
              ...session,
              [field]: value
            }
          : session
      )
    );
  };

  const updateSessionByKey = (
    key: string,
    updater: (session: SessionFormEntry) => SessionFormEntry
  ) => {
    setSessions((previous) =>
      previous.map((session) => (session.key === key ? updater(session) : session))
    );
  };

  const handleSessionManualStateChange = (key: string, value: SessionManualState) => {
    updateSessionByKey(key, (session) => ({
      ...session,
      manualState: value
    }));
  };

  const handleSessionTrainerChange = (key: string, index: number, value: string) => {
    updateSessionByKey(key, (session) => ({
      ...session,
      trainers: updateSelectionSlot(session.trainers, index, value)
    }));
  };

  const handleAddSessionTrainer = (key: string) => {
    setSessions((previous) =>
      previous.map((session) => {
        if (session.key !== key) {
          return session;
        }

        const blocked = computeBlockedSelectionSetsForSession(session, previous, events, deal.id);
        if (!hasAvailableSelectionOption(sessionTrainerOptions, session.trainers, blocked.trainers)) {
          return session;
        }

        return {
          ...session,
          trainers: appendSelectionSlot(session.trainers)
        } satisfies SessionFormEntry;
      })
    );
  };

  const handleRemoveSessionTrainer = (key: string, index: number) => {
    updateSessionByKey(key, (session) => ({
      ...session,
      trainers: removeSelectionSlot(session.trainers, index)
    }));
  };

  const handleSessionMobileUnitChange = (key: string, index: number, value: string) => {
    updateSessionByKey(key, (session) => ({
      ...session,
      mobileUnits: updateSelectionSlot(session.mobileUnits, index, value)
    }));
  };

  const handleAddSessionMobileUnit = (key: string) => {
    setSessions((previous) =>
      previous.map((session) => {
        if (session.key !== key) {
          return session;
        }

        const blocked = computeBlockedSelectionSetsForSession(session, previous, events, deal.id);
        if (!hasAvailableSelectionOption(mobileUnitOptions, session.mobileUnits, blocked.mobileUnits)) {
          return session;
        }

        return {
          ...session,
          mobileUnits: appendSelectionSlot(session.mobileUnits)
        } satisfies SessionFormEntry;
      })
    );
  };

  const handleRemoveSessionMobileUnit = (key: string, index: number) => {
    updateSessionByKey(key, (session) => ({
      ...session,
      mobileUnits: removeSelectionSlot(session.mobileUnits, index)
    }));
  };

  const persistExtras = (notes: StoredDealNote[], documents: StoredDealDocument[]) => {
    void persistDealExtras(deal.id, { notes, documents });
  };

  const releaseAttachmentPreviewUrl = useCallback(() => {
    setAttachmentPreviewUrl((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous);
      }

      return null;
    });
  }, []);

  const handleCloseAttachmentPreview = useCallback(() => {
    setPreviewAttachment(null);
    setAttachmentPreviewError(null);
    setAttachmentPreviewLoading(false);
    releaseAttachmentPreviewUrl();
  }, [releaseAttachmentPreviewUrl]);

  const handleViewAttachment = useCallback(
    async (attachment: DisplayAttachment) => {
      setPreviewAttachment(attachment);
      setAttachmentPreviewError(null);
      setAttachmentPreviewLoading(true);
      releaseAttachmentPreviewUrl();

      const sourceUrl = attachment.downloadUrl ?? attachment.url;

      if (!sourceUrl) {
        setAttachmentPreviewLoading(false);
        setAttachmentPreviewError('No se pudo obtener la URL del documento.');
        return;
      }

      try {
        const response = await fetch(sourceUrl);

        if (!response.ok) {
          throw new Error(`Error al descargar el documento: ${response.status}`);
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        setAttachmentPreviewUrl(objectUrl);
      } catch (error) {
        console.error('No se pudo cargar el documento del presupuesto', error);
        setAttachmentPreviewError(
          'No se pudo cargar el documento. Puedes intentar descargarlo directamente.'
        );
      } finally {
        setAttachmentPreviewLoading(false);
      }
    },
    [releaseAttachmentPreviewUrl]
  );

  const handleSaveSchedule = () => {
    if (isBusy) {
      return;
    }

    setSaveError(null);
    setSaveFeedback(null);

    if (sessions.length === 0) {
      setSaveError('No hay productos de formación disponibles para calendarizar.');
      return;
    }

    const incomplete = sessions.filter((session) => !session.start || !session.end);

    if (incomplete.length > 0) {
      setSaveError('Todas las sesiones deben tener fecha y hora de inicio y fin.');
      return;
    }

    const eventsToSave: CalendarEvent[] = [];
    const sanitizedClientName = sanitizeOptionalDealText(deal.clientName);
    const sanitizedFundae = sanitizeOptionalDealText(deal.fundae);
    const sanitizedCaes = sanitizeOptionalDealText(deal.caes);
    const sanitizedHotelPernocta = sanitizeOptionalDealText(deal.hotelPernocta);
    const sanitizedFormations = sanitizeSelectionList(formationLabels);

    for (const session of sessions) {
      const startIso = toIsoString(session.start);
      const endIso = toIsoString(session.end);

      if (!startIso || !endIso) {
        setSaveError('Las fechas introducidas no son válidas.');
        return;
      }

      const startDate = new Date(startIso);
      const endDate = new Date(endIso);

      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        setSaveError('Las fechas introducidas no son válidas.');
        return;
      }

      if (endDate.getTime() < startDate.getTime()) {
        setSaveError(
          'Hay sesiones donde la fecha de fin es anterior a la fecha de inicio. Por favor avisa al comercial.'
        );
        return;
      }

      const attendeesValue = Number.parseInt(session.attendees, 10);
      const attendees = Number.isFinite(attendeesValue) ? attendeesValue : null;
      const sanitizedTrainers = sanitizeSelectionList(session.trainers);
      const sanitizedMobileUnits = sanitizeSelectionList(session.mobileUnits);
      const logisticsInfo = session.logisticsInfo.trim();

      eventsToSave.push({
        id: `deal-${deal.id}-item-${session.dealProductId}-session-${session.sessionIndex}`,
        dealId: deal.id,
        dealTitle: deal.title,
        clientName: sanitizedClientName,
        dealProductId: session.dealProductId,
        productId: session.productId,
        productName: session.productName,
        sessionIndex: session.sessionIndex,
        start: startIso,
        end: endIso,
        attendees,
        sede: session.sede.trim() ? session.sede.trim() : null,
        address: session.address.trim() ? session.address.trim() : null,
        trainers: sanitizedTrainers,
        mobileUnits: sanitizedMobileUnits,
        formations: sanitizedFormations,
        fundae: sanitizedFundae,
        caes: sanitizedCaes,
        hotelPernocta: sanitizedHotelPernocta,
        logisticsInfo: logisticsInfo ? logisticsInfo : null,
        manualState: session.manualState
      });
    }

    onUpdateSchedule(deal.id, eventsToSave);
    setSaveFeedback('La calendarización se guardó correctamente.');
    setScheduleBaseline(currentScheduleSnapshot);
    setShowScheduleUnsavedConfirm(false);
    onHide();
  };

  const productOptions = useMemo(() => {
    const options = [...trainingProducts, ...extraProducts];
    return options.map((product) => ({
      label: product.name,
      value: `product-${product.dealProductId}`,
      dealProductId: product.dealProductId,
      productId: product.productId ?? null
    }));
  }, [extraProducts, trainingProducts]);

  const handleSubmitNote = (): boolean => {
    if (noteModalMode === 'view') {
      closeNoteModal();
      return true;
    }

    const trimmed = noteText.trim();

    if (!trimmed) {
      setNoteError('La nota no puede estar vacía.');
      return false;
    }

    if (noteModalMode === 'create') {
      const now = new Date().toISOString();

      const note: StoredDealNote = {
        id: generateId(),
        content: trimmed,
        createdAt: now,
        shareWithTrainer: shareWithTrainer === 'yes'
      };

      const updatedNotes = [...localNotes, note];
      setLocalNotes(updatedNotes);
      persistExtras(updatedNotes, localDocuments);
      closeNoteModal();
      return true;
    }

    if (noteModalMode === 'edit' && activeNote) {
      const updatedNotes = localNotes.map((noteItem) => {
        if (noteItem.id !== activeNote.id) {
          return noteItem;
        }

        return {
          ...noteItem,
          content: trimmed,
          shareWithTrainer: shareWithTrainer === 'yes'
        } satisfies StoredDealNote;
      });

      setLocalNotes(updatedNotes);
      persistExtras(updatedNotes, localDocuments);
      closeNoteModal();
      return true;
    }

    setNoteError('No se pudo actualizar la nota seleccionada.');
    return false;
  };

  const handleDeleteNote = () => {
    if (!activeNote || activeNote.source !== 'local') {
      return;
    }

    if (typeof window !== 'undefined') {
      const confirmed = window.confirm('¿Quieres eliminar esta nota?');
      if (!confirmed) {
        return;
      }
    }

    const updatedNotes = localNotes.filter((noteItem) => noteItem.id !== activeNote.id);
    setLocalNotes(updatedNotes);
    persistExtras(updatedNotes, localDocuments);
    closeNoteModal();
  };

  const handleOpenCreateNoteModal = () => {
    setNoteModalMode('create');
    setActiveNote(null);
    setNoteText('');
    setShareWithTrainer('no');
    setNoteModalInitialText('');
    setNoteModalInitialShare('no');
    setNoteError(null);
    setShowNoteUnsavedConfirm(false);
    setShowNoteModal(true);
  };

  const handleOpenExistingNoteModal = (note: DisplayNote) => {
    const shareValue: ShareWithTrainerOption = note.shareWithTrainer ? 'yes' : 'no';
    setActiveNote(note);
    setNoteModalMode(note.source === 'local' ? 'edit' : 'view');
    setNoteText(note.content ?? '');
    setShareWithTrainer(shareValue);
    setNoteModalInitialText(note.content ?? '');
    setNoteModalInitialShare(shareValue);
    setNoteError(null);
    setShowNoteUnsavedConfirm(false);
    setShowNoteModal(true);
  };

  const isViewingNote = noteModalMode === 'view';
  const isEditingNote = noteModalMode === 'edit';
  const noteModalTitle = isViewingNote
    ? 'Detalle de la nota'
    : isEditingNote
      ? 'Editar nota'
      : 'Añadir nota';
  const noteSubmitLabel = isEditingNote ? 'Guardar cambios' : 'Guardar nota';

  const handleAddDocument = (): boolean => {
    const trimmedName = documentName.trim();
    const trimmedUrl = documentUrl.trim();

    if (!trimmedName) {
      setDocumentError('Introduce un nombre para el documento.');
      return false;
    }

    try {
      const parsedUrl = new URL(trimmedUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch (error) {
      setDocumentError('Introduce una URL válida.');
      return false;
    }

    const now = new Date().toISOString();
    let dealProductId: number | undefined;
    let productId: number | undefined;
    let productName: string | undefined;

    if (documentTarget.startsWith('product-')) {
      const identifier = Number.parseInt(documentTarget.replace('product-', ''), 10);
      const matched = productOptions.find((option) => option.dealProductId === identifier);
      if (matched) {
        dealProductId = matched.dealProductId;
        productId = matched.productId ?? undefined;
        productName = matched.label;
      }
    }

    const document: StoredDealDocument = {
      id: generateId(),
      name: trimmedName,
      url: trimmedUrl,
      createdAt: now,
      dealProductId,
      productId,
      productName
    };

    const updatedDocuments = [...localDocuments, document];
    setLocalDocuments(updatedDocuments);
    persistExtras(localNotes, updatedDocuments);
    closeDocumentModal();
    return true;
  };

  const handleConfirmNoteDiscard = () => {
    closeNoteModal();
  };

  const handleConfirmNoteSave = () => {
    const saved = handleSubmitNote();
    if (!saved) {
      setShowNoteUnsavedConfirm(false);
    }
  };

  const handleKeepEditingNote = () => {
    setShowNoteUnsavedConfirm(false);
  };

  const handleConfirmDocumentDiscard = () => {
    closeDocumentModal();
  };

  const handleConfirmDocumentSave = () => {
    const saved = handleAddDocument();
    if (!saved) {
      setShowDocumentUnsavedConfirm(false);
    }
  };

  const handleKeepEditingDocument = () => {
    setShowDocumentUnsavedConfirm(false);
  };

  const handleRefresh = async () => {
    if (isLoading || isRefreshing) {
      return;
    }

    try {
      setIsRefreshing(true);
      await onDealRefetch();
      setSaveError(null);
      setSaveFeedback('Datos actualizados desde Pipedrive.');
    } catch (error) {
      console.error('No se pudo refrescar el deal', error);
      setSaveError('No se pudieron actualizar los datos desde Pipedrive.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const renderNoteOrigin = (note: DisplayNote) => {
    if (note.source === 'deal') {
      return 'Deal';
    }

    const productName = resolveProductName(
      note.dealProductId,
      note.productId,
      productMap.byDealProductId,
      productMap.byProductId
    );

    if (note.source === 'local') {
      return productName ? `ERP · ${productName}` : 'ERP';
    }

    if (productName) {
      return `Producto · ${productName}`;
    }

    return 'Producto';
  };

  const renderAttachmentOrigin = (attachment: DisplayAttachment) => {
    if (attachment.source === 'deal') {
      return 'Deal';
    }

    const productName = resolveProductName(
      attachment.dealProductId,
      attachment.productId,
      productMap.byDealProductId,
      productMap.byProductId
    );

    if (attachment.source === 'local') {
      return productName ? `ERP · ${productName}` : 'ERP';
    }

    if (productName) {
      return `Producto · ${productName}`;
    }

    return 'Producto';
  };

  const normalizedGeneralAddress = generalAddress.trim();

  return (
    <>
      <Modal
        show={show}
        onHide={handleScheduleModalCloseRequest}
        size="xl"
        backdrop="static"
        fullscreen="md-down"
      >
        <Modal.Header closeButton>
          <div>
            <Modal.Title>Presupuesto #{deal.id}</Modal.Title>
            <div className="text-muted small">{deal.title}</div>
          </div>
        </Modal.Header>
        <Modal.Body>
          <div className="position-relative">
            {isLoading ? (
              <div
                className="position-absolute top-0 start-0 w-100 h-100 d-flex flex-column justify-content-center align-items-center bg-white bg-opacity-75"
                style={{ zIndex: 1 }}
                aria-live="polite"
              >
                <div className="spinner-border" role="status" aria-hidden="true" />
                <div className="mt-3">Cargando presupuesto...</div>
              </div>
            ) : null}
            <Stack
              gap={4}
              aria-busy={isLoading}
              style={isLoading ? { pointerEvents: 'none', userSelect: 'none' } : undefined}
            >
            <Row className="g-4">
              <Col xl={7} lg={12}>
                <div className="border rounded p-3 h-100">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h5 className="mb-0">Datos generales</h5>
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      onClick={handleRefresh}
                      disabled={isBusy}
                    >
                      {isRefreshing
                        ? 'Actualizando…'
                        : isLoading
                          ? 'Cargando…'
                          : 'Actualizar desde Pipedrive'}
                    </Button>
                </div>
                  <Stack gap={3}>
                    <Row className="g-3">
                      <Col lg={6} md={6}>
                        <div className="d-flex flex-column gap-1 h-100">
                          <div className="text-uppercase text-muted small">Cliente</div>
                          <div className="fw-semibold">
                            {deal.clientName ?? 'Sin organización asociada'}
                          </div>
                        </div>
                      </Col>
                      <Col lg={6} md={6}>
                        <div className="d-flex flex-column gap-1 h-100">
                          <div className="text-uppercase text-muted small">Tipo de formación</div>
                          <div className="fw-semibold">{deal.pipelineName ?? 'Sin embudo definido'}</div>
                        </div>
                      </Col>
                    </Row>
                    <div>
                      {trainingProducts.length > 0 ? (
                        <>
                          <Row className="g-2 align-items-center text-uppercase text-muted small mb-2">
                            <Col md={8} sm={7}>Formación</Col>
                            <Col md={4} sm={5} className="d-flex justify-content-end">
                              <span className="recommended-hours-label">Horas</span>
                            </Col>
                          </Row>
                          <Stack gap={2}>
                            {trainingProducts.map((product) => (
                              <Row key={product.dealProductId} className="g-2 align-items-center">
                                <Col md={8} sm={7}>
                                  <div className="fw-semibold text-truncate" title={product.name}>
                                    {product.name}
                                  </div>
                                </Col>
                                <Col md={4} sm={5} className="d-flex justify-content-end">
                                  <Form.Group
                                    controlId={`recommended-hours-${product.dealProductId}`}
                                    className="mb-0 recommended-hours-field"
                                  >
                                    <Form.Control
                                      type="number"
                                      min={0}
                                      step={0.5}
                                      value={recommendedHoursByProduct[product.dealProductId] ?? ''}
                                      onChange={(event) =>
                                        handleRecommendedHoursChange(product.dealProductId, event.target.value)
                                      }
                                      placeholder="Sin horas"
                                      aria-label="Horas recomendadas"
                                      className="recommended-hours-input"
                                    />
                                  </Form.Group>
                                </Col>
                              </Row>
                            ))}
                          </Stack>
                        </>
                      ) : (
                        <div>
                          <div className="text-uppercase text-muted small mb-2">Formación</div>
                          <div className="text-muted">Sin productos formativos</div>
                        </div>
                      )}
                    </div>
                    <Row className="g-3 align-items-start">
                      <Col lg={8} md={12}>
                        <Form.Group controlId="general-address">
                          <Form.Label>Dirección de la formación</Form.Label>
                          <InputGroup>
                            <Form.Control
                              type="text"
                              value={generalAddress}
                              onChange={(event) => handleGeneralAddressChange(event.target.value)}
                              placeholder="Sin dirección definida"
                            />
                            <Button
                              variant="outline-secondary"
                              type="button"
                              onClick={() => setMapVisible(true)}
                              disabled={normalizedGeneralAddress.length === 0}
                            >
                              Ver mapa
                            </Button>
                          </InputGroup>
                        </Form.Group>
                      </Col>
                      <Col lg={4} md={12}>
                        <Form.Group controlId="general-sede">
                          <Form.Label>Sede</Form.Label>
                          <div className="fw-semibold">{deal.sede ?? 'Sin sede'}</div>
                        </Form.Group>
                      </Col>
                    </Row>
                    <Row className="g-3">
                      <Col lg={3} md={6}>
                        <Form.Group controlId="general-caes">
                          <Form.Label>CAES</Form.Label>
                          <Form.Control
                            type="text"
                            value={caesValue}
                            onChange={(event) => setCaesValue(event.target.value)}
                          />
                        </Form.Group>
                      </Col>
                      <Col lg={3} md={6}>
                        <Form.Group controlId="general-fundae">
                          <Form.Label>FUNDAE</Form.Label>
                          <Form.Control
                            type="text"
                            value={fundaeValue}
                            onChange={(event) => setFundaeValue(event.target.value)}
                          />
                        </Form.Group>
                      </Col>
                      <Col lg={3} md={6}>
                        <Form.Group controlId="general-hotel-pernocta">
                          <Form.Label>Hotel y Pernocta</Form.Label>
                          <Form.Control
                            type="text"
                            value={hotelPernoctaValue}
                            onChange={(event) => setHotelPernoctaValue(event.target.value)}
                          />
                        </Form.Group>
                      </Col>
                      <Col lg={3} md={6}>
                        <Form.Group controlId="general-attendees">
                          <Form.Label>Alumnos</Form.Label>
                          <Form.Control
                            type="number"
                            min={0}
                            value={generalAttendees}
                            onChange={(event) => handleGeneralAttendeesChange(event.target.value)}
                          />
                        </Form.Group>
                      </Col>
                    </Row>
                  </Stack>
                </div>
              </Col>
              <Col xl={5} lg={12}>
                <div className="border rounded p-3 h-100">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h5 className="mb-0">Extras</h5>
                  </div>
                  <Stack gap={3}>
                    <div className="border rounded p-3">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <div>
                          <div className="text-uppercase text-muted small">Notas</div>
                          <div className="fw-semibold">Seguimiento</div>
                        </div>
                        <Stack direction="horizontal" gap={2} className="flex-wrap justify-content-end">
                          {!notesExpanded ? (
                            <Badge
                              bg={notesCount > 0 ? 'danger' : 'dark'}
                              className="text-nowrap"
                            >
                              {`Notas: ${notesCount}`}
                            </Badge>
                          ) : null}
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            onClick={() => setNotesExpanded((previous) => !previous)}
                            aria-expanded={notesExpanded}
                            aria-controls="deal-notes-collapse"
                            className="text-nowrap"
                          >
                            {notesExpanded ? 'Ocultar' : 'Mostrar'}
                          </Button>
                          <Button variant="outline-primary" size="sm" onClick={handleOpenCreateNoteModal}>
                            Añadir nota
                          </Button>
                        </Stack>
                      </div>
                      <Collapse in={notesExpanded}>
                        <div id="deal-notes-collapse">
                          {notesCount > 0 ? (
                            <ListGroup variant="flush" className="border rounded">
                              {combinedNotes.map((note) => {
                                const { preview, truncated } = extractNotePreview(note.content);
                                return (
                                  <ListGroup.Item
                                    key={note.id}
                                    className="py-3"
                                    action
                                    onClick={() => handleOpenExistingNoteModal(note)}
                                  >
                                    <div className="fw-semibold mb-1" title={note.content}>
                                      {truncated ? `${preview}…` : preview}
                                    </div>
                                    <div className="small text-muted d-flex flex-wrap gap-3">
                                      <span>{renderNoteOrigin(note)}</span>
                                      {typeof note.shareWithTrainer === 'boolean' ? (
                                        <span>
                                          Compartir con formador: {note.shareWithTrainer ? 'Sí' : 'No'}
                                        </span>
                                      ) : null}
                                      {note.authorName ? <span>Autor: {note.authorName}</span> : null}
                                      {note.createdAt ? <span>{formatDateLabel(note.createdAt)}</span> : null}
                                    </div>
                                  </ListGroup.Item>
                                );
                              })}
                            </ListGroup>
                          ) : (
                            <div className="text-muted">Sin notas registradas.</div>
                          )}
                        </div>
                      </Collapse>
                    </div>
                    <div className="border rounded p-3">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <div>
                          <div className="text-uppercase text-muted small">Adjuntos</div>
                          <div className="fw-semibold">Documentación</div>
                        </div>
                        <Stack direction="horizontal" gap={2} className="flex-wrap justify-content-end">
                          {!attachmentsExpanded ? (
                            <Badge
                              bg={attachmentsCount > 0 ? 'danger' : 'dark'}
                              className="text-nowrap"
                            >
                              {`Adjuntos: ${attachmentsCount}`}
                            </Badge>
                          ) : null}
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            onClick={() => setAttachmentsExpanded((previous) => !previous)}
                            aria-expanded={attachmentsExpanded}
                            aria-controls="deal-attachments-collapse"
                            className="text-nowrap"
                          >
                            {attachmentsExpanded ? 'Ocultar' : 'Mostrar'}
                          </Button>
                          <Button variant="outline-primary" size="sm" onClick={() => setShowDocumentModal(true)}>
                            Añadir documento
                          </Button>
                        </Stack>
                      </div>
                      <Collapse in={attachmentsExpanded}>
                        <div id="deal-attachments-collapse">
                          {attachmentsCount > 0 ? (
                            <Table size="sm" responsive className="mb-0">
                              <thead>
                                <tr>
                                  <th>Documento</th>
                                  <th>Origen</th>
                                  <th className="text-end">Acciones</th>
                                </tr>
                              </thead>
                              <tbody>
                                {combinedAttachments.map((attachment) => (
                                  <tr key={attachment.id}>
                                    <td>
                                      <div className="fw-semibold">{attachment.name}</div>
                                      {attachment.addedAt ? (
                                        <div className="small text-muted">{formatDateLabel(attachment.addedAt)}</div>
                                      ) : null}
                                    </td>
                                    <td className="text-muted">{renderAttachmentOrigin(attachment)}</td>
                                    <td className="text-end">
                                      <Button
                                        variant="link"
                                        size="sm"
                                        className="px-0"
                                        onClick={() => handleViewAttachment(attachment)}
                                      >
                                        Ver
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </Table>
                          ) : (
                            <div className="text-muted">Sin archivos disponibles.</div>
                          )}
                        </div>
                      </Collapse>
                    </div>
                    <div className="border rounded p-3">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <div className="text-uppercase text-muted small">Productos extras</div>
                        <Stack direction="horizontal" gap={2} className="flex-wrap justify-content-end">
                          {!extraProductsExpanded ? (
                            <Badge
                              bg={extraProductsCount > 0 ? 'danger' : 'dark'}
                              className="text-nowrap"
                            >
                              {`Productos extras: ${extraProductsCount}`}
                            </Badge>
                          ) : null}
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            onClick={() => setExtraProductsExpanded((previous) => !previous)}
                            aria-expanded={extraProductsExpanded}
                            aria-controls="deal-extra-products-collapse"
                            className="text-nowrap"
                          >
                            {extraProductsExpanded ? 'Ocultar' : 'Mostrar'}
                          </Button>
                        </Stack>
                      </div>
                      <Collapse in={extraProductsExpanded}>
                        <div id="deal-extra-products-collapse">
                          {extraProductsCount > 0 ? (
                            <Table responsive size="sm" className="mb-0">
                              <thead>
                                <tr>
                                  <th>Producto</th>
                                  <th>Cantidad</th>
                                  <th>Notas</th>
                                </tr>
                              </thead>
                              <tbody>
                                {extraProducts.map((product) => (
                                  <tr key={`extra-${product.dealProductId}`}>
                                    <td>{product.name}</td>
                                    <td>{product.quantity}</td>
                                    <td>
                                      {product.notes.length > 0 ? (
                                        <ul className="mb-0 ps-3">
                                          {product.notes.map((note) => (
                                            <li key={`extra-note-${note.id}`}>{note.content}</li>
                                          ))}
                                        </ul>
                                      ) : (
                                        <span className="text-muted">Sin notas</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </Table>
                          ) : (
                            <div className="text-muted">No hay productos extras registrados.</div>
                          )}
                        </div>
                      </Collapse>
                    </div>
                  </Stack>
                </div>
              </Col>
            </Row>

            <div className="border rounded p-3">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="mb-0">Calendarización</h5>
              </div>
              {saveFeedback && (
                <Alert
                  variant="success"
                  onClose={() => setSaveFeedback(null)}
                  dismissible
                  className="mb-3"
                >
                  {saveFeedback}
                </Alert>
              )}
              {saveError && (
                <Alert
                  variant="danger"
                  onClose={() => setSaveError(null)}
                  dismissible
                  className="mb-3"
                >
                  {saveError}
                </Alert>
              )}

              {trainingProducts.length === 0 ? (
                <div className="text-muted">No hay productos de formación disponibles para calendarizar.</div>
              ) : (
                <Stack gap={3}>
                  {trainingProducts.map((product) => {
                    const productSessions = sessions.filter((session) => session.dealProductId === product.dealProductId);
                    const sessionCount = countSessionsForProduct(product);
                    return (
                      <div key={`calendar-${product.dealProductId}`} className="border rounded p-3">
                        <div className="d-flex justify-content-between align-items-center mb-3">
                          <div>
                            <div className="fw-semibold">{product.name}</div>
                            <div className="text-muted small">
                              {sessionCount} sesión{sessionCount === 1 ? '' : 'es'} ·{' '}
                              {product.recommendedHoursRaw ?? 'Horas recomendadas no disponibles'}
                            </div>
                          </div>
                        </div>
                        <Stack gap={3}>
                          {productSessions.map((session) => {
                            const blockedSelections =
                              blockedSelectionsBySession.get(session.key) ?? createEmptyBlockedSelectionSets();
                            const canAddTrainer = hasAvailableSelectionOption(
                              sessionTrainerOptions,
                              session.trainers,
                              blockedSelections.trainers
                            );
                            const canAddMobileUnit = hasAvailableSelectionOption(
                              mobileUnitOptions,
                              session.mobileUnits,
                              blockedSelections.mobileUnits
                            );

                            const displayState = getSessionDisplayState(session);
                            const stateLabel = getSessionStateLabel(displayState);
                            const stateColors = getSessionStateColors(displayState);

                            return (
                              <div
                                key={session.key}
                                className="border rounded p-3"
                                style={{ backgroundColor: stateColors.background, borderColor: stateColors.border }}
                              >
                                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                                  <div className="fw-semibold mb-0">Sesión {session.sessionIndex + 1}</div>
                                  <Badge
                                    bg="light"
                                    text="dark"
                                    style={{
                                      backgroundColor: stateColors.background,
                                      color: stateColors.text,
                                      border: `1px solid ${stateColors.border}`
                                    }}
                                  >
                                    {stateLabel}
                                  </Badge>
                                </div>
                                <Row className="g-4 align-items-start">
                                  <Col xl={6}>
                                    <Stack gap={3}>
                                      <Form.Group controlId={`manual-state-${session.key}`}>
                                        <Form.Label>Estado de la sesión</Form.Label>
                                        <Form.Select
                                          value={session.manualState}
                                          onChange={(event) =>
                                            handleSessionManualStateChange(
                                              session.key,
                                              event.target.value as SessionManualState
                                            )
                                          }
                                        >
                                          {manualStateOptions.map((option) => (
                                            <option key={option.value} value={option.value}>
                                              {option.label}
                                            </option>
                                          ))}
                                        </Form.Select>
                                      </Form.Group>
                                      <Row className="g-3">
                                        <Col md={6}>
                                          <Form.Group controlId={`start-${session.key}`}>
                                            <Form.Label>Hora y fecha inicio</Form.Label>
                                            <Form.Control
                                              type="datetime-local"
                                              value={session.start}
                                              onChange={(event) =>
                                                handleSessionStartChange(session.key, event.target.value)
                                              }
                                            />
                                          </Form.Group>
                                        </Col>
                                        <Col md={6}>
                                          <Form.Group controlId={`end-${session.key}`}>
                                            <Form.Label>Hora y fecha fin</Form.Label>
                                            <Form.Control
                                              type="datetime-local"
                                              value={session.end}
                                              onChange={(event) =>
                                                handleSessionEndChange(session.key, event.target.value)
                                              }
                                            />
                                          </Form.Group>
                                        </Col>
                                        <Col md={6}>
                                          <Form.Group controlId={`sede-${session.key}`}>
                                            <Form.Label>Sede</Form.Label>
                                            <Form.Control
                                              type="text"
                                              value={session.sede}
                                              onChange={(event) =>
                                                handleSessionFieldChange(session.key, 'sede', event.target.value)
                                              }
                                            />
                                          </Form.Group>
                                        </Col>
                                        <Col xs={12}>
                                          <Form.Group controlId={`address-${session.key}`}>
                                            <Form.Label>Dirección de la formación</Form.Label>
                                            <Form.Control
                                              type="text"
                                              value={session.address}
                                              onChange={(event) =>
                                                handleSessionFieldChange(session.key, 'address', event.target.value)
                                              }
                                            />
                                          </Form.Group>
                                        </Col>
                                      </Row>
                                      {sessionWarnings[session.key] && (
                                        <Alert variant="warning" className="mb-0">
                                          {sessionWarnings[session.key]}
                                        </Alert>
                                      )}
                                    </Stack>
                                  </Col>
                                <Col xl={6}>
                                  <Stack gap={3}>
                                    <Form.Group controlId={`trainers-${session.key}`}>
                                      <div className="d-flex justify-content-between align-items-center mb-2">
                                        <Form.Label className="mb-0">Formador / Bombero</Form.Label>
                                        <Button
                                          variant="outline-primary"
                                          size="sm"
                                          type="button"
                                          onClick={() => handleAddSessionTrainer(session.key)}
                                          aria-label="Añadir formador"
                                          disabled={!canAddTrainer}
                                        >
                                          +
                                        </Button>
                                      </div>
                                      <Stack gap={2}>
                                        {session.trainers.map((trainer, trainerIndex) => {
                                          const availableTrainerOptions = computeAvailableSelectionOptions(
                                            sessionTrainerOptions,
                                            session.trainers,
                                            trainerIndex,
                                            blockedSelections.trainers
                                          );

                                          return (
                                            <Stack
                                              direction="horizontal"
                                              gap={2}
                                              key={`${session.key}-trainer-${trainerIndex}`}
                                            >
                                              <Form.Select
                                                value={trainer}
                                                onChange={(event) =>
                                                  handleSessionTrainerChange(
                                                    session.key,
                                                    trainerIndex,
                                                    event.target.value
                                                  )
                                                }
                                              >
                                                <option value="">Selecciona un formador</option>
                                                {availableTrainerOptions.map((option) => (
                                                  <option
                                                    key={`${session.key}-trainer-${option}`}
                                                    value={option}
                                                  >
                                                    {option}
                                                  </option>
                                                ))}
                                              </Form.Select>
                                              {session.trainers.length > 1 && (
                                                <Button
                                                  variant="outline-danger"
                                                  size="sm"
                                                  type="button"
                                                  onClick={() =>
                                                    handleRemoveSessionTrainer(session.key, trainerIndex)
                                                  }
                                                  aria-label="Eliminar formador"
                                                >
                                                  &times;
                                                </Button>
                                              )}
                                            </Stack>
                                          );
                                        })}
                                      </Stack>
                                    </Form.Group>
                                    <Form.Group controlId={`mobile-units-${session.key}`}>
                                      <div className="d-flex justify-content-between align-items-center mb-2">
                                        <Form.Label className="mb-0">Unidad móvil</Form.Label>
                                        <Button
                                          variant="outline-primary"
                                          size="sm"
                                          type="button"
                                          onClick={() => handleAddSessionMobileUnit(session.key)}
                                          aria-label="Añadir unidad móvil"
                                          disabled={!canAddMobileUnit}
                                        >
                                          +
                                        </Button>
                                      </div>
                                      <Stack gap={2}>
                                        {session.mobileUnits.map((unit, unitIndex) => {
                                          const availableMobileUnitOptions =
                                            computeAvailableSelectionOptions(
                                              mobileUnitOptions,
                                              session.mobileUnits,
                                              unitIndex,
                                              blockedSelections.mobileUnits
                                            );

                                          return (
                                            <Stack
                                              direction="horizontal"
                                              gap={2}
                                              key={`${session.key}-unit-${unitIndex}`}
                                            >
                                              <Form.Select
                                                value={unit}
                                                onChange={(event) =>
                                                  handleSessionMobileUnitChange(
                                                    session.key,
                                                    unitIndex,
                                                    event.target.value
                                                  )
                                                }
                                              >
                                                <option value="">Selecciona una unidad</option>
                                                {availableMobileUnitOptions.map((option) => (
                                                  <option key={`${session.key}-unit-${option}`} value={option}>
                                                    {option}
                                                  </option>
                                                ))}
                                              </Form.Select>
                                              {session.mobileUnits.length > 1 && (
                                                <Button
                                                  variant="outline-danger"
                                                  size="sm"
                                                  type="button"
                                                  onClick={() =>
                                                    handleRemoveSessionMobileUnit(session.key, unitIndex)
                                                  }
                                                  aria-label="Eliminar unidad móvil"
                                                >
                                                  &times;
                                                </Button>
                                              )}
                                            </Stack>
                                          );
                                        })}
                                      </Stack>
                                    </Form.Group>
                                    <Form.Group controlId={`logistics-${session.key}`}>
                                      <Form.Label>Info logística</Form.Label>
                                      <Form.Control
                                        as="textarea"
                                        rows={3}
                                        value={session.logisticsInfo}
                                        onChange={(event) =>
                                          handleSessionFieldChange(session.key, 'logisticsInfo', event.target.value)
                                        }
                                      />
                                    </Form.Group>
                                  </Stack>
                                </Col>
                              </Row>
                            </div>
                            );
                          })}
                        </Stack>
                      </div>
                    );
                  })}
                </Stack>
              )}
            </div>
          </Stack>
        </div>
      </Modal.Body>
      <Modal.Footer className="justify-content-between">
          <div className="text-muted small">
            Los cambios se guardan en el calendario interno de planificación.
          </div>
          <div className="d-flex gap-2">
            <Button variant="secondary" onClick={handleScheduleModalCloseRequest}>
              Cerrar
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveSchedule}
              disabled={isBusy || trainingProducts.length === 0}
            >
              Guardar en calendario
            </Button>
          </div>
        </Modal.Footer>
      </Modal>

      <Modal show={showScheduleUnsavedConfirm} onHide={handleKeepEditingSchedule} centered>
        <Modal.Header closeButton>
          <Modal.Title>Cambios sin guardar</Modal.Title>
        </Modal.Header>
        <Modal.Body>Hay cambios sin guardar, ¿salimos sin guardar?</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleKeepEditingSchedule}>
            No
          </Button>
          <Button variant="primary" onClick={handleConfirmScheduleDiscard}>
            Ok
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showNoteModal} onHide={handleNoteModalClose} centered>
        <Modal.Header closeButton>
          <Modal.Title>{noteModalTitle}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {!isViewingNote && noteError ? (
            <Alert variant="danger" onClose={() => setNoteError(null)} dismissible>
              {noteError}
            </Alert>
          ) : null}
          {isViewingNote ? (
            <Stack gap={3}>
              <div>
                <div className="text-uppercase text-muted small mb-1">Contenido</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{noteText || 'Sin contenido'}</div>
              </div>
              {activeNote ? (
                <div className="small text-muted d-flex flex-wrap gap-3">
                  <span>{renderNoteOrigin(activeNote)}</span>
                  {typeof activeNote.shareWithTrainer === 'boolean' ? (
                    <span>Compartir con formador: {activeNote.shareWithTrainer ? 'Sí' : 'No'}</span>
                  ) : null}
                  {activeNote.authorName ? <span>Autor: {activeNote.authorName}</span> : null}
                  {activeNote.createdAt ? <span>{formatDateLabel(activeNote.createdAt)}</span> : null}
                </div>
              ) : null}
            </Stack>
          ) : (
            <Stack gap={3}>
              <Form.Group controlId="note-content">
                <Form.Label>Contenido</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={4}
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  placeholder="Añade aquí la nota para el equipo de planificación"
                />
              </Form.Group>
              <Form.Group controlId="note-share-with-trainer">
                <Form.Label>Compartir con Formador?</Form.Label>
                <Form.Select
                  value={shareWithTrainer}
                  onChange={(event) =>
                    setShareWithTrainer(event.target.value as ShareWithTrainerOption)
                  }
                >
                  <option value="no">No</option>
                  <option value="yes">Sí</option>
                </Form.Select>
              </Form.Group>
              {isEditingNote && activeNote ? (
                <div className="small text-muted d-flex flex-wrap gap-3">
                  <span>{renderNoteOrigin(activeNote)}</span>
                  {activeNote.authorName ? <span>Autor: {activeNote.authorName}</span> : null}
                  {activeNote.createdAt ? <span>{formatDateLabel(activeNote.createdAt)}</span> : null}
                </div>
              ) : null}
            </Stack>
          )}
        </Modal.Body>
        <Modal.Footer className={isEditingNote ? 'justify-content-between' : 'justify-content-end'}>
          {isEditingNote ? (
            <>
              <Button variant="outline-danger" onClick={handleDeleteNote}>
                Eliminar
              </Button>
              <div className="d-flex gap-2">
                <Button variant="secondary" onClick={handleNoteModalClose}>
                  Cancelar
                </Button>
                <Button variant="primary" onClick={handleSubmitNote}>
                  {noteSubmitLabel}
                </Button>
              </div>
            </>
          ) : isViewingNote ? (
            <Button variant="secondary" onClick={handleNoteModalClose}>
              Cerrar
            </Button>
          ) : (
            <div className="d-flex gap-2">
              <Button variant="secondary" onClick={handleNoteModalClose}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={handleSubmitNote}>
                {noteSubmitLabel}
              </Button>
            </div>
          )}
        </Modal.Footer>
      </Modal>

      <Modal show={showNoteUnsavedConfirm} onHide={handleKeepEditingNote} centered>
        <Modal.Header closeButton>
          <Modal.Title>Cambios sin guardar</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Has realizado cambios que no se han guardado. ¿Quieres guardarlos antes de cerrar?
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleKeepEditingNote}>
            Seguir editando
          </Button>
          <Button variant="outline-danger" onClick={handleConfirmNoteDiscard}>
            Cerrar sin guardar
          </Button>
          <Button variant="primary" onClick={handleConfirmNoteSave}>
            Guardar y cerrar
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showDocumentModal} onHide={handleDocumentModalClose} centered>
        <Modal.Header closeButton>
          <Modal.Title>Añadir documento</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {documentError && (
            <Alert variant="danger" onClose={() => setDocumentError(null)} dismissible>
              {documentError}
            </Alert>
          )}
          <Stack gap={3}>
            <Form.Group controlId="document-name">
              <Form.Label>Nombre</Form.Label>
              <Form.Control
                type="text"
                value={documentName}
                onChange={(event) => setDocumentName(event.target.value)}
                placeholder="Ej. Programa del curso"
              />
            </Form.Group>
            <Form.Group controlId="document-url">
              <Form.Label>URL</Form.Label>
              <Form.Control
                type="url"
                value={documentUrl}
                onChange={(event) => setDocumentUrl(event.target.value)}
                placeholder="https://..."
              />
            </Form.Group>
            <Form.Group controlId="document-target">
              <Form.Label>Asociar a</Form.Label>
              <Form.Select value={documentTarget} onChange={(event) => setDocumentTarget(event.target.value)}>
                <option value="general">General</option>
                {productOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleDocumentModalClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleAddDocument}>
            Guardar documento
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showDocumentUnsavedConfirm} onHide={handleKeepEditingDocument} centered>
        <Modal.Header closeButton>
          <Modal.Title>Cambios sin guardar</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Has realizado cambios que no se han guardado. ¿Quieres guardarlos antes de cerrar?
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleKeepEditingDocument}>
            Seguir editando
          </Button>
          <Button variant="outline-danger" onClick={handleConfirmDocumentDiscard}>
            Cerrar sin guardar
          </Button>
          <Button variant="primary" onClick={handleConfirmDocumentSave}>
            Guardar y cerrar
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={previewAttachment !== null}
        onHide={handleCloseAttachmentPreview}
        size="xl"
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>{previewAttachment?.name ?? 'Documento'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {attachmentPreviewError ? (
            <Alert
              variant="danger"
              onClose={() => setAttachmentPreviewError(null)}
              dismissible
              className="mb-3"
            >
              {attachmentPreviewError}
            </Alert>
          ) : null}
          {attachmentPreviewLoading ? (
            <div className="d-flex flex-column align-items-center justify-content-center py-5">
              <Spinner animation="border" role="status">
                <span className="visually-hidden">Cargando…</span>
              </Spinner>
              <div className="mt-3 text-muted">Cargando documento…</div>
            </div>
          ) : attachmentPreviewUrl ? (
            <div className="border rounded overflow-hidden" style={{ minHeight: '60vh' }}>
              <iframe
                title={`Vista previa de ${previewAttachment?.name ?? 'documento'}`}
                src={attachmentPreviewUrl}
                className="w-100 h-100 border-0"
                allowFullScreen
              />
            </div>
          ) : previewAttachment && !attachmentPreviewError ? (
            <div className="text-muted">El documento no está disponible.</div>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCloseAttachmentPreview}>
            Cerrar
          </Button>
          {attachmentPreviewUrl ? (
            <Button
              as="a"
              href={attachmentPreviewUrl}
              download={previewAttachment?.name || undefined}
              variant="primary"
            >
              Descargar
            </Button>
          ) : previewAttachment?.downloadUrl || previewAttachment?.url ? (
            <Button
              as="a"
              href={previewAttachment.downloadUrl ?? previewAttachment.url}
              target="_blank"
              rel="noopener noreferrer"
              variant="primary"
            >
              Descargar
            </Button>
          ) : null}
        </Modal.Footer>
      </Modal>

      <Modal show={mapVisible} onHide={() => setMapVisible(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>Ubicación de la formación</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {normalizedGeneralAddress ? (
            <div className="ratio ratio-16x9">
              <iframe
                title="Ubicación"
                src={`https://www.google.com/maps?q=${encodeURIComponent(normalizedGeneralAddress)}&output=embed`}
                allowFullScreen
              />
            </div>
          ) : (
            <div className="text-muted">No se ha definido una dirección.</div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            as="a"
            href={
              normalizedGeneralAddress
                ? `https://www.google.com/maps?q=${encodeURIComponent(normalizedGeneralAddress)}`
                : '#'
            }
            target="_blank"
            rel="noopener noreferrer"
            variant="primary"
            disabled={normalizedGeneralAddress.length === 0}
          >
            Abrir en Google Maps
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default DealDetailModal;
