import { useEffect, useState } from 'react';
import Container from 'react-bootstrap/Container';
import Stack from 'react-bootstrap/Stack';
import CalendarView from './components/calendar/CalendarView';
import DealsBoard from './components/deals/DealsBoard';
import HeaderBar from './components/layout/HeaderBar';
import { CalendarEvent, loadCalendarEvents, persistCalendarEvents } from './services/calendar';
import './App.scss';

type TabKey = 'calendar' | 'backlog';

const App = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('calendar');
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(() => loadCalendarEvents());

  useEffect(() => {
    persistCalendarEvents(calendarEvents);
  }, [calendarEvents]);

  const handleUpdateSchedule = (dealId: number, events: CalendarEvent[]) => {
    setCalendarEvents((previous) => {
      const filtered = previous.filter((event) => event.dealId !== dealId);
      return [...filtered, ...events];
    });
  };

  return (
    <div className="app-shell">
      <HeaderBar onNavigate={setActiveTab} activeKey={activeTab} />
      <main className="app-main">
        <Container fluid className="pt-4 pb-5">
          <Stack gap={4}>
            {activeTab === 'calendar' ? (
              <CalendarView events={calendarEvents} />
            ) : (
              <DealsBoard events={calendarEvents} onUpdateSchedule={handleUpdateSchedule} />
            )}
          </Stack>
        </Container>
      </main>
    </div>
  );
};

export default App;
