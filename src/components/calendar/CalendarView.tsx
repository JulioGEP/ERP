import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EventClickArg } from '@fullcalendar/core';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import Badge from 'react-bootstrap/Badge';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Collapse from 'react-bootstrap/Collapse';
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import Row from 'react-bootstrap/Row';
import {
  CalendarEvent,
  getSessionDisplayState,
  getSessionStateColors,
  getSessionStateLabel
} from '../../services/calendar';

interface CalendarViewProps {
  events: CalendarEvent[];
  onSelectEvent?: (event: CalendarEvent) => void;
  dealIdFilter?: string;
  onDealIdFilterChange?: (value: string) => void;
  knownDealIds?: number[];
  onDealNotFound?: (dealId: number) => void;
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

type CalendarFilters = Record<FilterKey, string>;

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

const createEmptyFilters = (): CalendarFilters =>
  filterKeys.reduce((accumulator, key) => {
    accumulator[key] = '';
    return accumulator;
  }, {} as CalendarFilters);

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

const fallbackClientName = 'Sin organización asociada';
const fallbackSede = 'Sin sede definida';
const fallbackFormationsLabel = 'Sin formaciones form-';

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

const buildEventTitle = (event: CalendarEvent) => {
  const segments = [event.productName];

  if (event.attendees != null) {
    segments.push(`${event.attendees} alumno${event.attendees === 1 ? '' : 's'}`);
  }

  if (event.sede) {
    segments.push(event.sede);
  }

  if (event.mobileUnits && event.mobileUnits.length > 0) {
    const label = event.mobileUnits.length === 1 ? 'Unidad' : 'Unidades';
    segments.push(`${label}: ${event.mobileUnits.join(', ')}`);
  }

  if (event.trainers && event.trainers.length > 0) {
    const label = event.trainers.length === 1 ? 'Formador' : 'Formadores';
    segments.push(`${label}: ${event.trainers.join(', ')}`);
  }

  if (event.logisticsInfo) {
    segments.push(`Info logística: ${event.logisticsInfo}`);
  }

  return segments.join(' · ');
};

const CalendarView = ({
  events,
  onSelectEvent,
  dealIdFilter,
  onDealIdFilterChange,
  knownDealIds = [],
  onDealNotFound
}: CalendarViewProps) => {
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [filters, setFilters] = useState<CalendarFilters>(() => createEmptyFilters());
  const lastPromptedDealIdRef = useRef<string | null>(null);
  const filterPanelId = 'calendar-filters-panel';

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

  const trainerOptions = useMemo<FilterOption[]>(() => {
    const baseOption: FilterOption = { value: '', label: 'Todos los bomberos' };

    if (availableTrainers.length === 0) {
      return [baseOption];
    }

    return [baseOption, ...availableTrainers.map((trainer) => ({ value: trainer, label: trainer }))];
  }, [availableTrainers]);

  const mobileUnitOptions = useMemo<FilterOption[]>(() => {
    const baseOption: FilterOption = { value: '', label: 'Todas las unidades móviles' };

    if (availableMobileUnits.length === 0) {
      return [baseOption];
    }

    return [baseOption, ...availableMobileUnits.map((unit) => ({ value: unit, label: unit }))];
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

  const handleFilterChange = useCallback(
    (key: FilterKey, value: string) => {
      setFilters((previous) => ({ ...previous, [key]: value }));

      if (key === 'id') {
        onDealIdFilterChange?.(value);
      }
    },
    [onDealIdFilterChange]
  );

  const handleResetFilters = useCallback(() => {
    setFilters(createEmptyFilters());
    onDealIdFilterChange?.('');
  }, [onDealIdFilterChange]);

  const getFilterFieldValue = useCallback((event: CalendarEvent, key: FilterKey): string => {
    switch (key) {
      case 'id':
        return String(event.dealId);
      case 'title':
        return event.dealTitle ?? '';
      case 'clientName':
        return event.clientName ?? fallbackClientName;
      case 'formations':
        return event.formations.length > 0 ? event.formations.join(' ') : fallbackFormationsLabel;
      case 'fundae':
        return event.fundae ?? '';
      case 'caes':
        return event.caes ?? '';
      case 'hotelPernocta':
        return event.hotelPernocta ?? '';
      case 'sede':
        return event.sede ?? fallbackSede;
      case 'address':
        return event.address ?? '';
      case 'trainer':
        return event.trainers.length > 0 ? event.trainers.join(' ') : '';
      case 'mobileUnit':
        return event.mobileUnits.length > 0 ? event.mobileUnits.join(' ') : '';
      default:
        return '';
    }
  }, []);

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

  const filteredEvents = useMemo<CalendarEvent[]>(() => {
    if (events.length === 0) {
      return [];
    }

    if (normalizedFilters.length === 0) {
      return events;
    }

    return events.filter((event) =>
      normalizedFilters.every(([key, filterValue]) => {
        const haystack = normaliseText(getFilterFieldValue(event, key));
        return haystack.includes(filterValue);
      })
    );
  }, [events, normalizedFilters, getFilterFieldValue]);

  const showEmptyState = isFiltering && filteredEvents.length === 0;

  useEffect(() => {
    const trimmed = filters.id.trim();

    if (trimmed.length === 0) {
      lastPromptedDealIdRef.current = null;
      return;
    }

    if (filteredEvents.length > 0) {
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

    if (!knownDealIds.includes(parsedDealId)) {
      lastPromptedDealIdRef.current = trimmed;
      return;
    }

    lastPromptedDealIdRef.current = trimmed;
    onDealNotFound?.(parsedDealId);
  }, [filteredEvents, filters.id, knownDealIds, onDealNotFound]);

  return (
    <Card className="calendar-card border-0">
      <Card.Body className="p-0">
        <div className="d-flex justify-content-end mb-4">
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
                              <Form.Group controlId={`calendar-filter-${key}`}>
                                <Form.Label>{definition.label}</Form.Label>
                                {definition.type === 'select' ? (
                                  <Form.Select
                                    value={filters[key]}
                                    onChange={(event) => handleFilterChange(key, event.target.value)}
                                  >
                                    {(definition.options ?? [{ value: '', label: 'Todas las opciones' }]).map((option) => (
                                      <option key={`${key}-${option.value || 'all'}`} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
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

        {showEmptyState && (
          <div className="text-center text-secondary pb-3">
            <p className="fw-semibold mb-1">No se encontraron eventos con los filtros aplicados.</p>
            <Button variant="link" type="button" onClick={handleResetFilters} className="p-0">
              Limpiar filtros
            </Button>
          </div>
        )}

        <div className="calendar-scroll-container">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
            }}
            weekends
            selectable={false}
            editable={false}
            slotDuration="00:30:00"
            slotMinTime="00:00:00"
            scrollTime="06:00:00"
            height="parent"
            nowIndicator
            events={filteredEvents.map((event) => {
              const displayState = getSessionDisplayState(event);
              const stateColors = getSessionStateColors(displayState);
              const stateLabel = getSessionStateLabel(displayState);

              return {
                id: event.id,
                title: buildEventTitle(event),
                start: event.start,
                end: event.end,
                backgroundColor: stateColors.background,
                borderColor: stateColors.border,
                textColor: stateColors.text,
                extendedProps: {
                  dealId: event.dealId,
                  dealTitle: event.dealTitle,
                  productName: event.productName,
                  attendees: event.attendees,
                  sede: event.sede,
                  address: event.address,
                  trainers: event.trainers,
                  mobileUnits: event.mobileUnits,
                  logisticsInfo: event.logisticsInfo,
                  clientName: event.clientName,
                  formations: event.formations,
                  fundae: event.fundae,
                  caes: event.caes,
                  hotelPernocta: event.hotelPernocta,
                  manualState: event.manualState,
                  state: displayState,
                  stateLabel
                }
              };
            })}
            eventClick={(info: EventClickArg) => {
              if (!onSelectEvent) {
                return;
              }

              const calendarEvent = filteredEvents.find((item) => item.id === info.event.id);

              if (calendarEvent) {
                onSelectEvent(calendarEvent);
              }
            }}
            locales={[esLocale]}
            locale="es"
          />
        </div>
      </Card.Body>
    </Card>
  );
};

export default CalendarView;
