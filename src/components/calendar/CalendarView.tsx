import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import { useMemo, useState } from 'react';
import Badge from 'react-bootstrap/Badge';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Col from 'react-bootstrap/Col';
import Collapse from 'react-bootstrap/Collapse';
import Form from 'react-bootstrap/Form';
import Row from 'react-bootstrap/Row';
import {
  buildNormalizedFilters,
  createEmptyFilters,
  DealsFilters,
  filterDefinitions,
  FilterKey,
  normaliseText
} from '../../services/dealFilters';
import { CalendarEvent } from '../../services/calendar';

interface CalendarViewProps {
  events: CalendarEvent[];
}

const getCalendarEventFilterFieldValue = (event: CalendarEvent, key: FilterKey): string => {
  const storedValue = event.filterValues?.[key] ?? '';
  if (storedValue.trim().length > 0) {
    return storedValue;
  }

  switch (key) {
    case 'id':
      return String(event.dealId);
    case 'title':
      return event.dealTitle;
    case 'sede':
      return event.sede ?? '';
    case 'address':
      return event.address ?? '';
    case 'formations':
    case 'trainingProducts':
    case 'extraProducts':
      return event.productName;
    case 'notes':
      return event.logisticsInfo ?? '';
    default:
      return '';
  }
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

const CalendarView = ({ events }: CalendarViewProps) => {
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [filters, setFilters] = useState<DealsFilters>(() => createEmptyFilters());
  const filterPanelId = 'calendar-filters-panel';

  const normalizedFilters = useMemo(() => buildNormalizedFilters(filters), [filters]);
  const activeFilterCount = normalizedFilters.length;
  const isFiltering = activeFilterCount > 0;

  const filteredEvents = useMemo(() => {
    if (events.length === 0) {
      return [];
    }

    if (normalizedFilters.length === 0) {
      return events;
    }

    return events.filter((event) =>
      normalizedFilters.every(([key, filterValue]) => {
        const haystack = normaliseText(getCalendarEventFilterFieldValue(event, key));
        return haystack.includes(filterValue);
      })
    );
  }, [events, normalizedFilters]);

  const showNoResults = isFiltering && filteredEvents.length === 0 && events.length > 0;

  const calendarItems = useMemo(
    () =>
      filteredEvents.map((event) => ({
        id: event.id,
        title: buildEventTitle(event),
        start: event.start,
        end: event.end,
        extendedProps: {
          dealId: event.dealId,
          dealTitle: event.dealTitle,
          productName: event.productName,
          attendees: event.attendees,
          sede: event.sede,
          address: event.address,
          trainers: event.trainers,
          mobileUnits: event.mobileUnits,
          logisticsInfo: event.logisticsInfo
        }
      })),
    [filteredEvents]
  );

  const handleFilterChange = (key: FilterKey, value: string) => {
    setFilters((current) => ({
      ...current,
      [key]: value
    }));
  };

  const handleResetFilters = () => {
    setFilters(createEmptyFilters());
  };

  return (
    <Card className="calendar-card border-0">
      <Card.Body className="p-0">
        <div className="p-3 border-bottom">
          <div className="d-flex justify-content-end">
            <Button
              variant={isFiltering ? 'primary' : 'outline-secondary'}
              onClick={() => setFiltersExpanded((current) => !current)}
              aria-expanded={filtersExpanded}
              aria-controls={filterPanelId}
            >
              {filtersExpanded ? 'Ocultar filtros' : 'Mostrar filtros'}
              {activeFilterCount > 0 && (
                <Badge
                  bg={isFiltering ? 'light' : 'secondary'}
                  text={isFiltering ? 'dark' : undefined}
                  className="ms-2"
                >
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </div>

          <Collapse in={filtersExpanded}>
            <div id={filterPanelId} className="mt-3">
              <div className="border rounded p-3">
                <Form>
                  <Row className="g-3">
                    {filterDefinitions.map((definition) => (
                      <Col key={definition.key} lg={4} md={6} sm={12}>
                        <Form.Group controlId={`calendar-filter-${definition.key}`}>
                          <Form.Label>{definition.label}</Form.Label>
                          <Form.Control
                            type="text"
                            value={filters[definition.key]}
                            placeholder={definition.placeholder}
                            onChange={(event) => handleFilterChange(definition.key, event.target.value)}
                          />
                        </Form.Group>
                      </Col>
                    ))}
                  </Row>
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

          {showNoResults && (
            <div className="mt-3 text-center text-secondary">
              <p className="fw-semibold mb-1">No hay eventos en el calendario con los filtros seleccionados.</p>
              <Button variant="link" type="button" onClick={handleResetFilters} className="p-0">
                Limpiar filtros
              </Button>
            </div>
          )}
        </div>

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
            events={calendarItems}
            locales={[esLocale]}
            locale="es"
          />
        </div>
      </Card.Body>
    </Card>
  );
};

export default CalendarView;
