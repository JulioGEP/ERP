import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import Button from 'react-bootstrap/Button';
import Container from 'react-bootstrap/Container';
import Modal from 'react-bootstrap/Modal';
import Stack from 'react-bootstrap/Stack';
import DealDetailModal from './components/deals/DealDetailModal';
import HeaderBar from './components/layout/HeaderBar';
import { CalendarEvent, fetchSharedCalendarEvents, persistCalendarEvents } from './services/calendar';
import { fetchDealById, DealRecord } from './services/deals';
import './App.scss';

const CalendarView = lazy(() => import('./components/calendar/CalendarView'));
const DealsBoard = lazy(() => import('./components/deals/DealsBoard'));

type TabKey = 'calendar' | 'backlog';

type CalendarModalStatus = 'idle' | 'loading' | 'success' | 'error';

const App = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('calendar');
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const hasLoadedInitialEventsRef = useRef(false);
  const hasUserModifiedEventsRef = useRef(false);
  const calendarEventsRef = useRef<CalendarEvent[]>([]);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [calendarModalStatus, setCalendarModalStatus] = useState<CalendarModalStatus>('idle');
  const [selectedCalendarDealId, setSelectedCalendarDealId] = useState<number | null>(null);
  const [selectedCalendarDeal, setSelectedCalendarDeal] = useState<DealRecord | null>(null);
  const [calendarModalError, setCalendarModalError] = useState<string | null>(null);
  const dealCacheRef = useRef<Record<number, DealRecord>>({});
  const activeDealRequestRef = useRef<number | null>(null);

  useEffect(() => {
    calendarEventsRef.current = calendarEvents;

    if (!hasLoadedInitialEventsRef.current) {
      return;
    }

    void persistCalendarEvents(calendarEvents);
  }, [calendarEvents]);

  useEffect(() => {
    let isActive = true;

    const synchronizeCalendar = async () => {
      const remoteEvents = await fetchSharedCalendarEvents();

      if (!isActive) {
        return;
      }

      hasLoadedInitialEventsRef.current = true;

      if (hasUserModifiedEventsRef.current) {
        void persistCalendarEvents(calendarEventsRef.current);
        hasUserModifiedEventsRef.current = false;
        return;
      }

      if (remoteEvents) {
        hasUserModifiedEventsRef.current = false;
        setCalendarEvents(remoteEvents);
      }
    };

    void synchronizeCalendar();

    return () => {
      isActive = false;
    };
  }, []);


  const handleUpdateSchedule = (dealId: number, events: CalendarEvent[]) => {
    hasUserModifiedEventsRef.current = true;

    setCalendarEvents((previous) => {
      const filtered = previous.filter((event) => event.dealId !== dealId);
      return [...filtered, ...events];
    });
  };

  const loadCalendarDeal = useCallback(
    async (dealId: number, options?: { forceRefresh?: boolean }) => {
      activeDealRequestRef.current = dealId;
      setCalendarModalError(null);

      const shouldForceRefresh = options?.forceRefresh ?? false;
      const cachedDeal = shouldForceRefresh ? undefined : dealCacheRef.current[dealId];

      if (cachedDeal) {
        setSelectedCalendarDeal(cachedDeal);
        setCalendarModalStatus('success');
      } else {
        setSelectedCalendarDeal(null);
        setCalendarModalStatus('loading');
      }

      try {
        const deal = await fetchDealById(dealId, { refresh: shouldForceRefresh });

        if (activeDealRequestRef.current !== dealId) {
          return;
        }

        dealCacheRef.current = { ...dealCacheRef.current, [dealId]: deal };
        setSelectedCalendarDeal(deal);
        setCalendarModalStatus('success');
      } catch (error) {
        if (activeDealRequestRef.current !== dealId) {
          return;
        }

        console.error('No se pudo cargar el presupuesto seleccionado', error);

        if (!cachedDeal || shouldForceRefresh) {
          setCalendarModalStatus('error');
          setCalendarModalError(
            error instanceof Error
              ? error.message
              : 'No se pudo cargar el presupuesto seleccionado. Inténtalo de nuevo más tarde.'
          );
        }
      }
    },
    []
  );

  const handleCalendarEventSelect = useCallback(
    (event: CalendarEvent) => {
      setSelectedCalendarDealId(event.dealId);
      setIsCalendarModalOpen(true);
      void loadCalendarDeal(event.dealId);
    },
    [loadCalendarDeal]
  );

  const handleCalendarModalClose = useCallback(() => {
    setIsCalendarModalOpen(false);
    setCalendarModalStatus('idle');
    setSelectedCalendarDealId(null);
    setSelectedCalendarDeal(null);
    setCalendarModalError(null);
    activeDealRequestRef.current = null;
  }, []);

  const handleCalendarModalRetry = useCallback(() => {
    if (selectedCalendarDealId == null) {
      return;
    }

    void loadCalendarDeal(selectedCalendarDealId, { forceRefresh: true });
  }, [loadCalendarDeal, selectedCalendarDealId]);

  const handleCalendarDealRefetch = useCallback(async () => {
    if (selectedCalendarDealId == null) {
      throw new Error('No hay un presupuesto seleccionado para actualizar.');
    }

    const refreshed = await fetchDealById(selectedCalendarDealId, { refresh: true });
    dealCacheRef.current = { ...dealCacheRef.current, [selectedCalendarDealId]: refreshed };
    setSelectedCalendarDeal(refreshed);
  }, [selectedCalendarDealId]);

  return (
    <div className="app-shell">
      <HeaderBar onNavigate={setActiveTab} activeKey={activeTab} />
      <main className="app-main">
        <Container fluid className="pt-4 pb-5">
          <Stack gap={4}>
            <Suspense
              fallback={
                <div className="py-5 text-center text-muted">
                  Cargando {activeTab === 'calendar' ? 'calendario' : 'tablero'}...
                </div>
              }
            >
              {activeTab === 'calendar' ? (
                <CalendarView events={calendarEvents} onSelectEvent={handleCalendarEventSelect} />
              ) : (
                <DealsBoard events={calendarEvents} onUpdateSchedule={handleUpdateSchedule} />
              )}
            </Suspense>
          </Stack>
        </Container>
      </main>

      {isCalendarModalOpen && calendarModalStatus === 'loading' && (
        <Modal show centered backdrop="static" keyboard={false} onHide={handleCalendarModalClose}>
          <Modal.Body className="py-5 text-center">
            <div className="mb-3">
              <span className="spinner-border" role="status" aria-hidden="true" />
            </div>
            <div>Cargando presupuesto...</div>
          </Modal.Body>
        </Modal>
      )}

      {isCalendarModalOpen && calendarModalStatus === 'error' && (
        <Modal show centered onHide={handleCalendarModalClose}>
          <Modal.Header closeButton>
            <Modal.Title>No se pudo cargar el presupuesto</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p className="mb-0">
              {calendarModalError ?? 'No se pudo cargar el presupuesto seleccionado. Inténtalo de nuevo más tarde.'}
            </p>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={handleCalendarModalClose}>
              Cerrar
            </Button>
            <Button variant="primary" onClick={handleCalendarModalRetry} disabled={selectedCalendarDealId == null}>
              Reintentar
            </Button>
          </Modal.Footer>
        </Modal>
      )}

      {isCalendarModalOpen && selectedCalendarDeal && (
        <DealDetailModal
          show
          deal={selectedCalendarDeal}
          onHide={handleCalendarModalClose}
          events={calendarEvents}
          onUpdateSchedule={handleUpdateSchedule}
          onDealRefetch={handleCalendarDealRefetch}
          isLoading={calendarModalStatus === 'loading'}
        />
      )}
    </div>
  );
};

export default App;
