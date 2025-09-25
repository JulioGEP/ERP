import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Badge from 'react-bootstrap/Badge';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Col from 'react-bootstrap/Col';
import Collapse from 'react-bootstrap/Collapse';
import Form from 'react-bootstrap/Form';
import Placeholder from 'react-bootstrap/Placeholder';
import Row from 'react-bootstrap/Row';
import Stack from 'react-bootstrap/Stack';
import Table from 'react-bootstrap/Table';
import { CalendarEvent } from '../../services/calendar';
import {
  fetchDealById,
  fetchDeals,
  fetchSharedHiddenDealIds,
  fetchSharedManualDeals,
  deleteDeal,
  DealRecord,
  buildDealFormationLabels,
  countSessionsForProduct,
  loadHiddenDealIds,
  loadStoredManualDeals,
  persistHiddenDealIds,
  persistStoredManualDeals,
  splitDealProductsByCode,
  syncDeal
} from '../../services/deals';
import DealDetailModal from './DealDetailModal';

const skeletonColumnCount = 7;
const skeletonRows = Array.from({ length: 4 }, (_, index) => (
  <tr key={`skeleton-${index}`}>
    {Array.from({ length: skeletonColumnCount }).map((__, cell) => (
      <td key={cell}>
        <Placeholder animation="wave" xs={12} className="rounded-pill" />
      </td>
    ))}
  </tr>
));

type FeedbackState = { type: 'success' | 'error'; message: string } | null;
type SortField = 'id' | 'wonDate' | 'title' | 'clientName' | 'sede' | 'formations';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

type FilterKey =
  | 'id'
  | 'title'
  | 'clientName'
  | 'formations'
  | 'fundae'
  | 'caes'
  | 'hotelPernocta'
  | 'sede'
  | 'address'
  | 'trainer'
  | 'mobileUnit';

type DealsFilters = Record<FilterKey, string>;

type FilterInputType = 'text' | 'select';

interface FilterOption {
  value: string;
  label: string;
}

interface FilterDefinition {
  key: FilterKey;
  label: string;
  placeholder?: string;
  type: FilterInputType;
  options?: FilterOption[];
}

const filterRows: FilterKey[][] = [
  ['id', 'clientName', 'title', 'formations'],
  ['fundae', 'caes', 'hotelPernocta', 'sede'],
  ['address', 'trainer', 'mobileUnit']
];

const filterKeys: FilterKey[] = [
  'id',
  'clientName',
  'title',
  'formations',
  'fundae',
  'caes',
  'hotelPernocta',
  'sede',
  'address',
  'trainer',
  'mobileUnit'
];

const createEmptyFilters = (): DealsFilters =>
  filterKeys.reduce((accumulator, key) => {
    accumulator[key] = '';
    return accumulator;
  }, {} as DealsFilters);

const createYesNoOptions = (allLabel: string): FilterOption[] => [
  { value: '', label: allLabel },
  { value: 'si', label: 'Sí' },
  { value: 'no', label: 'No' }
];

const fundaeSelectOptions = createYesNoOptions('Todas las opciones');
const caesSelectOptions = createYesNoOptions('Todas las opciones');
const hotelPernoctaSelectOptions = createYesNoOptions('Todas las opciones');

const sedeSelectOptions: FilterOption[] = [
  { value: '', label: 'Todas las sedes' },
  { value: 'GEP Arganda', label: 'GEP Arganda' },
  { value: 'GEP Sabadell', label: 'GEP Sabadell' },
  { value: 'In Company', label: 'In Company' }
];

const normaliseText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');

const buildUniqueList = (values: string[]): string[] => {
  const map = new Map<string, string>();

  values.forEach((value) => {
    if (typeof value !== 'string') {
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return;
    }

    const normalized = normaliseText(trimmed);

    if (!map.has(normalized)) {
      map.set(normalized, trimmed);
    }
  });

  return Array.from(map.values());
};

const buildSessionKey = (dealId: number, dealProductId: number, sessionIndex: number) =>
  `${dealId}-${dealProductId}-${sessionIndex}`;

const isEventComplete = (event: CalendarEvent | undefined): boolean => {
  if (!event) {
    return false;
  }

  const start = typeof event.start === 'string' ? event.start.trim() : '';
  const end = typeof event.end === 'string' ? event.end.trim() : '';

  return start.length > 0 && end.length > 0;
};

interface DealsBoardProps {
  events: CalendarEvent[];
  onUpdateSchedule: (dealId: number, events: CalendarEvent[]) => void;
  dealIdFilter?: string;
  onDealIdFilterChange?: (value: string) => void;
  onDealNotFound?: (dealId: number) => void;
  onKnownDealIdsChange?: (dealIds: number[]) => void;
}

const DealsBoard = ({
  events,
  onUpdateSchedule,
  dealIdFilter,
  onDealIdFilterChange,
  onDealNotFound,
  onKnownDealIdsChange
}: DealsBoardProps) => {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [selectedDealId, setSelectedDealId] = useState<number | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ field: 'wonDate', direction: 'desc' });
  const [manualDeals, setManualDeals] = useState<DealRecord[]>(() => loadStoredManualDeals());
  const [hiddenDealIds, setHiddenDealIds] = useState<number[]>(() => loadHiddenDealIds());
  const hasSynchronizedSharedDataRef = useRef(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [filters, setFilters] = useState<DealsFilters>(() => createEmptyFilters());
  const lastPromptedDealIdRef = useRef<string | null>(null);
  const shouldPersistManualDealsRef = useRef(false);
  const shouldPersistHiddenDealIdsRef = useRef(false);
  const filterPanelId = 'deals-filters-panel';
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['deals', 'stage-3'],
    queryFn: fetchDeals,
    staleTime: 1000 * 60
  });

  useEffect(() => {
    if (!shouldPersistManualDealsRef.current) {
      return;
    }

    shouldPersistManualDealsRef.current = false;
    void persistStoredManualDeals(manualDeals);
  }, [manualDeals]);

  useEffect(() => {
    if (!shouldPersistHiddenDealIdsRef.current) {
      return;
    }

    shouldPersistHiddenDealIdsRef.current = false;
    void persistHiddenDealIds(hiddenDealIds);
  }, [hiddenDealIds]);

  useEffect(() => {
    setManualDeals((previous) => previous.filter((deal) => !hiddenDealIds.includes(deal.id)));
  }, [hiddenDealIds]);

  useEffect(() => {
    if (hasSynchronizedSharedDataRef.current) {
      return () => {};
    }

    hasSynchronizedSharedDataRef.current = true;
    let isActive = true;

    const synchronizeSharedData = async () => {
      try {
        const [sharedManualDeals, sharedHiddenIds] = await Promise.all([
          fetchSharedManualDeals(),
          fetchSharedHiddenDealIds()
        ]);

        if (!isActive) {
          return;
        }

        setHiddenDealIds(sharedHiddenIds);

        setManualDeals((previous) => {
          const hiddenSet = new Set(sharedHiddenIds);
          const merged = new Map<number, DealRecord>();

          previous.forEach((deal) => {
            if (!hiddenSet.has(deal.id)) {
              merged.set(deal.id, deal);
            }
          });

          sharedManualDeals.forEach((deal) => {
            if (!hiddenSet.has(deal.id)) {
              merged.set(deal.id, deal);
            } else {
              merged.delete(deal.id);
            }
          });

          return Array.from(merged.values());
        });
      } catch (error) {
        console.error('No se pudieron sincronizar los datos compartidos de presupuestos', error);
      }
    };

    void synchronizeSharedData();

    return () => {
      isActive = false;
    };
  }, [hiddenDealIds, manualDeals]);

  const registerManualDeal = useCallback((deal: DealRecord) => {
    setManualDeals((previous) => {
      const filtered = previous.filter((item) => item.id !== deal.id);
      const next = [deal, ...filtered];

      shouldPersistManualDealsRef.current = true;
      return next;
    });

    setHiddenDealIds((previous) => {
      if (!previous.includes(deal.id)) {
        return previous;
      }

      shouldPersistHiddenDealIdsRef.current = true;
      return previous.filter((dealId) => dealId !== deal.id);
    });
  }, []);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('es-ES', {
        dateStyle: 'medium'
      }),
    []
  );

  const fallbackClientName = 'Sin organización asociada';
  const fallbackSede = 'Sin sede definida';
  const fallbackFormationsLabel = 'Sin formaciones form-';

  const formatDealDate = useCallback(
    (value: string | null) => {
      if (!value) {
        return 'Sin fecha';
      }

      const timestamp = Date.parse(value);

      if (Number.isNaN(timestamp)) {
        return value;
      }

      return dateFormatter.format(new Date(timestamp));
    },
    [dateFormatter]
  );

  const hiddenDealIdSet = useMemo(() => new Set(hiddenDealIds), [hiddenDealIds]);

  const scheduledSessionsByKey = useMemo(() => {
    const map = new Map<string, CalendarEvent>();

    events.forEach((event) => {
      const key = buildSessionKey(event.dealId, event.dealProductId, event.sessionIndex);
      map.set(key, event);
    });

    return map;
  }, [events]);

  const hasPendingSessions = useCallback(
    (deal: DealRecord) => {
      const { trainingProducts } = splitDealProductsByCode({
        trainingProducts: deal.trainingProducts,
        extraProducts: deal.extraProducts
      });

      for (const product of trainingProducts) {
        const sessionsCount = countSessionsForProduct(product);

        if (sessionsCount <= 0) {
          continue;
        }

        for (let index = 0; index < sessionsCount; index += 1) {
          const key = buildSessionKey(deal.id, product.dealProductId, index);
          const event = scheduledSessionsByKey.get(key);

          if (!isEventComplete(event)) {
            return true;
          }
        }
      }

      return false;
    },
    [scheduledSessionsByKey]
  );

  useEffect(() => {
    if (!data || data.length === 0) {
      return;
    }

    setManualDeals((previous) =>
      previous.filter(
        (manualDeal) =>
          !data.some(
            (dealItem) => dealItem.id === manualDeal.id && hasPendingSessions(dealItem)
          )
      )
    );
  }, [data, hasPendingSessions]);

  const dealsWithManual = useMemo<DealRecord[]>(() => {
    const map = new Map<number, DealRecord>();
    const manualDealIds = new Set(manualDeals.map((deal) => deal.id));

    (data ?? []).forEach((deal) => {
      if (!hiddenDealIdSet.has(deal.id)) {
        map.set(deal.id, deal);
      }
    });

    manualDeals.forEach((deal) => {
      if (!hiddenDealIdSet.has(deal.id)) {
        map.set(deal.id, deal);
      }
    });

    return Array.from(map.values()).filter(
      (deal) => manualDealIds.has(deal.id) || hasPendingSessions(deal)
    );
  }, [data, manualDeals, hiddenDealIdSet, hasPendingSessions]);

  const dealFormationMap = useMemo<Map<number, string[]>>(() => {
    const map = new Map<number, string[]>();

    dealsWithManual.forEach((deal) => {
      const { trainingProducts } = splitDealProductsByCode({
        trainingProducts: deal.trainingProducts,
        extraProducts: deal.extraProducts
      });
      map.set(deal.id, buildDealFormationLabels(deal.formations, trainingProducts));
    });

    return map;
  }, [dealsWithManual]);

  const availableTrainers = useMemo(() => {
    const values: string[] = [];

    events.forEach((event) => {
      values.push(...event.trainers);
    });

    const unique = buildUniqueList(values);
    unique.sort((first, second) => first.localeCompare(second, 'es', { sensitivity: 'base' }));
    return unique;
  }, [events]);

  const availableMobileUnits = useMemo(() => {
    const values: string[] = [];

    events.forEach((event) => {
      values.push(...event.mobileUnits);
    });

    const unique = buildUniqueList(values);
    unique.sort((first, second) => first.localeCompare(second, 'es', { sensitivity: 'base' }));
    return unique;
  }, [events]);

  const dealTrainerMap = useMemo<Map<number, string[]>>(() => {
    const map = new Map<number, string[]>();

    events.forEach((event) => {
      const sanitizedTrainers = buildUniqueList(event.trainers);

      if (sanitizedTrainers.length === 0) {
        return;
      }

      const existing = map.get(event.dealId) ?? [];
      const combined = buildUniqueList([...existing, ...sanitizedTrainers]);
      combined.sort((first, second) => first.localeCompare(second, 'es', { sensitivity: 'base' }));
      map.set(event.dealId, combined);
    });

    return map;
  }, [events]);

  const dealMobileUnitMap = useMemo<Map<number, string[]>>(() => {
    const map = new Map<number, string[]>();

    events.forEach((event) => {
      const sanitizedUnits = buildUniqueList(event.mobileUnits);

      if (sanitizedUnits.length === 0) {
        return;
      }

      const existing = map.get(event.dealId) ?? [];
      const combined = buildUniqueList([...existing, ...sanitizedUnits]);
      combined.sort((first, second) => first.localeCompare(second, 'es', { sensitivity: 'base' }));
      map.set(event.dealId, combined);
    });

    return map;
  }, [events]);

  const trainerOptions = useMemo<FilterOption[]>(() => {
    const baseOption: FilterOption = { value: '', label: 'Todos los bomberos' };

    if (availableTrainers.length === 0) {
      return [baseOption];
    }

    return [
      baseOption,
      ...availableTrainers.map((trainer) => ({ value: trainer, label: trainer }))
    ];
  }, [availableTrainers]);

  const mobileUnitOptions = useMemo<FilterOption[]>(() => {
    const baseOption: FilterOption = { value: '', label: 'Todas las unidades móviles' };

    if (availableMobileUnits.length === 0) {
      return [baseOption];
    }

    return [
      baseOption,
      ...availableMobileUnits.map((unit) => ({ value: unit, label: unit }))
    ];
  }, [availableMobileUnits]);

  const filterDefinitions = useMemo<Record<FilterKey, FilterDefinition>>(
    () => ({
      id: {
        key: 'id',
        label: 'Presupuesto',
        placeholder: 'Ej. 1234',
        type: 'text'
      },
      clientName: {
        key: 'clientName',
        label: 'Cliente',
        placeholder: 'Nombre de la organización',
        type: 'text'
      },
      title: {
        key: 'title',
        label: 'Título',
        placeholder: 'Busca por título',
        type: 'text'
      },
      formations: {
        key: 'formations',
        label: 'Formación',
        placeholder: 'Formaciones vinculadas',
        type: 'text'
      },
      fundae: {
        key: 'fundae',
        label: 'FUNDAE',
        type: 'select',
        options: fundaeSelectOptions
      },
      caes: {
        key: 'caes',
        label: 'CAES',
        type: 'select',
        options: caesSelectOptions
      },
      hotelPernocta: {
        key: 'hotelPernocta',
        label: 'Hotel Pernocta',
        type: 'select',
        options: hotelPernoctaSelectOptions
      },
      sede: {
        key: 'sede',
        label: 'Sede de la formación',
        type: 'select',
        options: sedeSelectOptions
      },
      address: {
        key: 'address',
        label: 'Dirección',
        placeholder: 'Dirección de la formación',
        type: 'text'
      },
      trainer: {
        key: 'trainer',
        label: 'Bombero',
        type: 'select',
        options: trainerOptions
      },
      mobileUnit: {
        key: 'mobileUnit',
        label: 'Unidades móviles',
        type: 'select',
        options: mobileUnitOptions
      }
    }),
    [mobileUnitOptions, trainerOptions]
  );

  const getFilterFieldValue = useCallback(
    (deal: DealRecord, key: FilterKey): string => {
      switch (key) {
        case 'id':
          return String(deal.id);
        case 'title':
          return deal.title ?? '';
        case 'clientName':
          return deal.clientName ?? fallbackClientName;
        case 'formations': {
          const formations = dealFormationMap.get(deal.id) ?? [];
          return formations.length > 0 ? formations.join(' ') : fallbackFormationsLabel;
        }
        case 'fundae':
          return deal.fundae ?? '';
        case 'caes':
          return deal.caes ?? '';
        case 'hotelPernocta':
          return deal.hotelPernocta ?? '';
        case 'sede':
          return deal.sede ?? fallbackSede;
        case 'address':
          return deal.address ?? '';
        case 'trainer': {
          const trainers = dealTrainerMap.get(deal.id);
          return trainers ? trainers.join(' ') : '';
        }
        case 'mobileUnit': {
          const mobileUnits = dealMobileUnitMap.get(deal.id);
          return mobileUnits ? mobileUnits.join(' ') : '';
        }
        default:
          return '';
      }
    },
    [
      dealFormationMap,
      dealMobileUnitMap,
      dealTrainerMap,
      fallbackClientName,
      fallbackFormationsLabel,
      fallbackSede
    ]
  );

  const normalizedFilters = useMemo(
    () =>
      (Object.entries(filters) as [FilterKey, string][])
        .map(([key, value]) => [key, value.trim()] as [FilterKey, string])
        .filter(([, value]) => value.length > 0)
        .map(([key, value]) => [key, normaliseText(value)] as [FilterKey, string]),
    [filters]
  );

  const activeFilterCount = normalizedFilters.length;
  const isFiltering = activeFilterCount > 0;

  useEffect(() => {
    if (dealIdFilter == null) {
      return;
    }

    setFilters((current) => {
      if (current.id === dealIdFilter) {
        return current;
      }

      return {
        ...current,
        id: dealIdFilter
      };
    });
  }, [dealIdFilter]);

  const filteredDeals = useMemo<DealRecord[]>(() => {
    if (dealsWithManual.length === 0) {
      return [];
    }

    if (normalizedFilters.length === 0) {
      return dealsWithManual;
    }

    return dealsWithManual.filter((deal) =>
      normalizedFilters.every(([key, filterValue]) => {
        const haystack = normaliseText(getFilterFieldValue(deal, key));
        return haystack.includes(filterValue);
      })
    );
  }, [dealsWithManual, normalizedFilters, getFilterFieldValue]);

  const sortedDeals = useMemo<DealRecord[]>(() => {
    if (filteredDeals.length === 0) {
      return [];
    }

    const items = [...filteredDeals];
    const { field, direction } = sortConfig;
    const multiplier = direction === 'asc' ? 1 : -1;

    const normaliseString = (input: string | null | undefined) => (input ?? '').trim();

    const compareStrings = (
      firstValue: string | null | undefined,
      secondValue: string | null | undefined
    ) => normaliseString(firstValue).localeCompare(normaliseString(secondValue), 'es', { sensitivity: 'base' });

    const parseDateForSort = (value: string | null) => {
      if (!value) {
        return Number.NEGATIVE_INFINITY;
      }

      const timestamp = Date.parse(value);
      return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
    };

    items.sort((first, second) => {
      let comparison = 0;

      switch (field) {
        case 'id':
          comparison = first.id - second.id;
          break;
        case 'wonDate':
          comparison = parseDateForSort(first.wonDate) - parseDateForSort(second.wonDate);
          break;
        case 'title':
          comparison = compareStrings(first.title, second.title);
          break;
        case 'clientName':
          comparison = compareStrings(first.clientName ?? fallbackClientName, second.clientName ?? fallbackClientName);
          break;
        case 'sede':
          comparison = compareStrings(first.sede ?? fallbackSede, second.sede ?? fallbackSede);
          break;
        case 'formations': {
          const firstFormations = dealFormationMap.get(first.id) ?? [];
          const secondFormations = dealFormationMap.get(second.id) ?? [];
          const firstLabel =
            firstFormations.length > 0 ? firstFormations.join(', ') : fallbackFormationsLabel;
          const secondLabel =
            secondFormations.length > 0 ? secondFormations.join(', ') : fallbackFormationsLabel;
          comparison = compareStrings(firstLabel, secondLabel);
          break;
        }
        default:
          comparison = 0;
      }

      if (comparison === 0) {
        comparison = first.id - second.id;
      }

      return comparison * multiplier;
    });

    return items;
  }, [
    dealFormationMap,
    filteredDeals,
    sortConfig,
    fallbackClientName,
    fallbackFormationsLabel,
    fallbackSede
  ]);

  const handleSort = (field: SortField) => {
    setSortConfig((current) => {
      if (current.field === field) {
        return { field, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }

      const defaultDirection: SortDirection = field === 'id' || field === 'wonDate' ? 'desc' : 'asc';
      return { field, direction: defaultDirection };
    });
  };

  const getAriaSort = (field: SortField): 'ascending' | 'descending' | undefined => {
    if (sortConfig.field !== field) {
      return undefined;
    }

    return sortConfig.direction === 'asc' ? 'ascending' : 'descending';
  };

  const handleFilterChange = (key: FilterKey, value: string) => {
    setFilters((current) => ({
      ...current,
      [key]: value
    }));

    if (key === 'id') {
      onDealIdFilterChange?.(value);
    }
  };

  const handleResetFilters = () => {
    setFilters(createEmptyFilters());
    onDealIdFilterChange?.('');
  };

  const renderSortButton = (label: string, field: SortField) => {
    const isActive = sortConfig.field === field;
    const direction = isActive ? sortConfig.direction : null;

    return (
      <button
        type="button"
        className="table-sort-button"
        onClick={() => handleSort(field)}
        aria-label={`Ordenar por ${label}`}
      >
        <span>{label}</span>
        {direction && (
          <span className="table-sort-indicator" aria-hidden="true">
            {direction === 'asc' ? '▲' : '▼'}
          </span>
        )}
      </button>
    );
  };

  const handleRemoveDeal = async (dealId: number) => {
    const confirmed = window.confirm(
      '¿Quieres eliminar este deal de la lista de "Presupuestos"? Podrás recuperarlo subiéndolo de nuevo.'
    );

    if (!confirmed) {
      return;
    }

    const hadScheduledEvents = events.some((event) => event.dealId === dealId);

    setFeedback(null);

    try {
      await deleteDeal(dealId);
    } catch (error) {
      console.error('No se pudo eliminar el presupuesto indicado', error);
      setFeedback({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'No se pudo eliminar el presupuesto seleccionado. Inténtalo de nuevo más tarde.'
      });
      return;
    }

    setHiddenDealIds((previous) => {
      if (previous.includes(dealId)) {
        return previous;
      }

      shouldPersistHiddenDealIdsRef.current = true;
      return [...previous, dealId];
    });

    setManualDeals((previous) => {
      const filtered = previous.filter((deal) => deal.id !== dealId);

      if (filtered.length === previous.length) {
        return previous;
      }

      shouldPersistManualDealsRef.current = true;
      return filtered;
    });
    setSelectedDealId((current) => (current === dealId ? null : current));

    queryClient.setQueryData<DealRecord[]>(['deals', 'stage-3'], (previous) => {
      const current = previous ?? [];
      return current.filter((item) => item.id !== dealId);
    });

    if (hadScheduledEvents) {
      onUpdateSchedule(dealId, []);
    }

    setFeedback({
      type: 'success',
      message: hadScheduledEvents
        ? `Presupuesto #${dealId} eliminado de la lista y del calendario.`
        : `Presupuesto #${dealId} eliminado de la lista.`
    });
  };

  const knownDealIds = useMemo(() => dealsWithManual.map((deal) => deal.id), [dealsWithManual]);

  useEffect(() => {
    onKnownDealIdsChange?.(knownDealIds);
  }, [knownDealIds, onKnownDealIdsChange]);

  useEffect(() => {
    const trimmed = filters.id.trim();

    if (trimmed.length === 0) {
      lastPromptedDealIdRef.current = null;
      return;
    }

    if (filteredDeals.length > 0) {
      lastPromptedDealIdRef.current = null;
      return;
    }

    if (lastPromptedDealIdRef.current === trimmed) {
      return;
    }

    const parsedDealId = Number(trimmed);

    if (!Number.isFinite(parsedDealId)) {
      lastPromptedDealIdRef.current = trimmed;
      return;
    }

    const existsInCalendar = events.some((event) => event.dealId === parsedDealId);

    if (!existsInCalendar) {
      lastPromptedDealIdRef.current = trimmed;
      return;
    }

    lastPromptedDealIdRef.current = trimmed;
    onDealNotFound?.(parsedDealId);
  }, [events, filteredDeals, filters.id, onDealNotFound]);

  const uploadDeal = useMutation<void, unknown, number>({
    mutationFn: (dealId: number) => syncDeal(dealId),
    onSuccess: async (_, dealId) => {
      setFeedback({
        type: 'success',
        message: `Presupuesto #${dealId} sincronizado correctamente.`
      });

      await queryClient.invalidateQueries({ queryKey: ['deals', 'stage-3'] });
    },
    onError: (mutationError: unknown) => {
      setFeedback({
        type: 'error',
        message:
          mutationError instanceof Error
            ? mutationError.message
            : 'No se pudo cargar el presupuesto especificado.'
      });
    }
  });

  const handleUploadDeal = async () => {
    const rawId = window.prompt('Introduce el ID del presupuesto que deseas subir');

    if (!rawId) {
      return;
    }

    const trimmed = rawId.trim();
    const dealId = Number.parseInt(trimmed, 10);

    if (!Number.isFinite(dealId)) {
      setFeedback({
        type: 'error',
        message: 'Debes introducir un identificador numérico válido.'
      });
      return;
    }

    setFeedback(null);

    try {
      await uploadDeal.mutateAsync(dealId);
    } catch (mutationError) {
      console.error('No se pudo subir el presupuesto indicado', mutationError);
    }
  };

  const handleSelectDeal = (dealId: number) => {
    setSelectedDealId(dealId);
  };

  const handleCloseModal = () => {
    setSelectedDealId(null);
  };

  const selectedDeal = useMemo(() => {
    if (!selectedDealId) {
      return null;
    }

    return dealsWithManual.find((deal) => deal.id === selectedDealId) ?? null;
  }, [dealsWithManual, selectedDealId]);

  return (
    <>
      <Card className="deals-card border-0" role="region" aria-live="polite">
        <Card.Body>
          <div className="d-flex justify-content-end mb-4">
            <Stack direction="horizontal" gap={2}>
              <Button
                variant={isFiltering ? 'primary' : 'outline-secondary'}
                onClick={() => setFiltersExpanded((current) => !current)}
                aria-expanded={filtersExpanded}
                aria-controls={filterPanelId}
              >
                {filtersExpanded ? 'Ocultar filtros' : 'Mostrar filtros'}
                {activeFilterCount > 0 && (
                  <Badge bg={isFiltering ? 'light' : 'secondary'} text={isFiltering ? 'dark' : undefined} className="ms-2">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
              <Button variant="primary" onClick={handleUploadDeal} disabled={uploadDeal.isPending}>
                {uploadDeal.isPending ? 'Subiendo…' : 'Subir Deal'}
              </Button>
            </Stack>
          </div>

          <Collapse in={filtersExpanded}>
            <div id={filterPanelId} className="mb-4">
              <div className="border rounded p-3">
                <Form>
                  <div className="d-flex flex-column gap-3">
                    {filterRows.map((row, rowIndex) => {
                      const columnSize = Math.floor(12 / row.length);

                      return (
                        <Row key={`filter-row-${rowIndex}`} className="g-3">
                          {row.map((key) => {
                            const definition = filterDefinitions[key];
                            const columnWidth = Number.isFinite(columnSize) ? columnSize : 4;

                            return (
                              <Col key={key} lg={columnWidth} md={6} sm={12}>
                                <Form.Group controlId={`filter-${key}`}>
                                  <Form.Label>{definition.label}</Form.Label>
                                  {definition.type === 'select' ? (
                                    <Form.Select
                                      value={filters[key]}
                                      onChange={(event) => handleFilterChange(key, event.target.value)}
                                    >
                                      {(definition.options ?? [{ value: '', label: 'Todas las opciones' }]).map(
                                        (option) => (
                                          <option key={`${key}-${option.value || 'all'}`} value={option.value}>
                                            {option.label}
                                          </option>
                                        )
                                      )}
                                    </Form.Select>
                                  ) : (
                                    <Form.Control
                                      type="text"
                                      value={filters[key]}
                                      placeholder={definition.placeholder}
                                      onChange={(event) => handleFilterChange(key, event.target.value)}
                                    />
                                  )}
                                </Form.Group>
                              </Col>
                            );
                          })}
                        </Row>
                      );
                    })}
                  </div>
                  <div className="d-flex justify-content-end gap-2 mt-3">
                    <Button
                      type="button"
                      variant="outline-secondary"
                      onClick={handleResetFilters}
                      disabled={!isFiltering}
                    >
                      Limpiar filtros
                    </Button>
                  </div>
                </Form>
              </div>
            </div>
          </Collapse>

          {feedback && (
            <Alert
              variant={feedback.type === 'success' ? 'success' : 'danger'}
              dismissible
              onClose={() => setFeedback(null)}
              className="mb-4"
              role="alert"
            >
              {feedback.message}
            </Alert>
          )}

          {isError && (
            <Alert variant="danger" className="mb-4" role="alert">
              Ocurrió un error al sincronizar los presupuestos.
              <div className="small text-muted">{error instanceof Error ? error.message : 'Intenta de nuevo más tarde.'}</div>
            </Alert>
          )}

          <div className="table-responsive">
            <Table hover className="align-middle mb-0">
              <thead>
                <tr>
                  <th scope="col" aria-sort={getAriaSort('id')}>
                    {renderSortButton('Presupuesto', 'id')}
                  </th>
                  <th scope="col" aria-sort={getAriaSort('wonDate')}>
                    {renderSortButton('Fecha de ganado', 'wonDate')}
                  </th>
                  <th scope="col" aria-sort={getAriaSort('title')}>
                    {renderSortButton('Título', 'title')}
                  </th>
                  <th scope="col" aria-sort={getAriaSort('clientName')}>
                    {renderSortButton('Cliente', 'clientName')}
                  </th>
                  <th scope="col" aria-sort={getAriaSort('sede')}>
                    {renderSortButton('Sede', 'sede')}
                  </th>
                  <th scope="col" aria-sort={getAriaSort('formations')}>
                    {renderSortButton('Formación', 'formations')}
                  </th>
                  <th scope="col" className="text-end">
                    <span className="text-uppercase text-muted small">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading && skeletonRows}

                {!isLoading && sortedDeals.length > 0 &&
                  sortedDeals.map((deal) => {
                    const formations = dealFormationMap.get(deal.id) ?? [];

                    return (
                      <tr
                        key={deal.id}
                        role="button"
                        style={{ cursor: 'pointer' }}
                        onClick={() => handleSelectDeal(deal.id)}
                      >
                        <td className="fw-semibold text-primary">#{deal.id}</td>
                        <td className="text-nowrap">{formatDealDate(deal.wonDate)}</td>
                        <td>{deal.title}</td>
                        <td>{deal.clientName ?? fallbackClientName}</td>
                        <td>{deal.sede ?? fallbackSede}</td>
                        <td>
                          {formations.length > 0 ? (
                            <Stack direction="horizontal" gap={2} className="flex-wrap">
                              {formations.map((name) => (
                                <Badge key={name} bg="info" text="dark" className="px-3 py-2 rounded-pill">
                                  {name}
                                </Badge>
                              ))}
                            </Stack>
                          ) : (
                            <span className="text-muted">{fallbackFormationsLabel}</span>
                          )}
                        </td>
                        <td className="text-end">
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleRemoveDeal(deal.id);
                            }}
                          >
                            Eliminar
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </Table>
          </div>

          {!isLoading && isFiltering && filteredDeals.length === 0 && dealsWithManual.length > 0 && (
            <div className="text-center py-5 text-secondary">
              <p className="fw-semibold">No se encontraron presupuestos con los filtros aplicados.</p>
              <Button variant="link" type="button" onClick={handleResetFilters} className="p-0">
                Limpiar filtros
              </Button>
            </div>
          )}

          {!isLoading && dealsWithManual.length === 0 && !isError && (
            <div className="text-center py-5 text-secondary">
              <p className="fw-semibold">No hay presupuestos en el embudo seleccionado.</p>
              <p className="mb-0">En cuanto un presupuesto se marque como ganado en Pipedrive, aparecerá automáticamente aquí.</p>
            </div>
          )}
        </Card.Body>
      </Card>

      {selectedDeal && (
        <DealDetailModal
          show
          deal={selectedDeal}
          onHide={handleCloseModal}
          events={events}
          onUpdateSchedule={onUpdateSchedule}
          onDealRefetch={async () => {
            try {
              const refreshed = await fetchDealById(selectedDeal.id, { refresh: true });
              registerManualDeal(refreshed);
              queryClient.setQueryData<DealRecord[]>(['deals', 'stage-3'], (previous) => {
                const current = previous ?? [];
                const filtered = current.filter((item) => item.id !== refreshed.id);
                return [refreshed, ...filtered];
              });
            } catch (refreshError) {
              console.error('No se pudo actualizar el deal seleccionado', refreshError);
            }
          }}
          isLoading={false}
        />
      )}
    </>
  );
};

export default DealsBoard;
