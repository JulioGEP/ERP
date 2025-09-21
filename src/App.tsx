import { useState } from 'react';
import Container from 'react-bootstrap/Container';
import Stack from 'react-bootstrap/Stack';
import CalendarView from './components/calendar/CalendarView.tsx';
import DealsBoard from './components/deals/DealsBoard.tsx';
import HeaderBar from './components/layout/HeaderBar.tsx';
import './App.scss';

type TabKey = 'calendar' | 'backlog';

const App = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('calendar');

  return (
    <div className="app-shell">
      <HeaderBar onNavigate={setActiveTab} activeKey={activeTab} />
      <main className="app-main">
        <Container fluid className="pt-4 pb-5">
          <Stack gap={4}>
            {activeTab === 'calendar' ? <CalendarView /> : <DealsBoard />}
          </Stack>
        </Container>
      </main>
    </div>
  );
};

export default App;
