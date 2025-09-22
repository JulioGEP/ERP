import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import Card from 'react-bootstrap/Card';

const CalendarView = () => (
  <Card className="calendar-card border-0">
    <Card.Body className="p-0">
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
          slotMinTime="06:00:00"
          scrollTime="06:00:00"
          height="parent"
          nowIndicator
          events={[]}
          locales={[esLocale]}
          locale="es"
        />
      </div>
    </Card.Body>
  </Card>
);

export default CalendarView;
