import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import Card from 'react-bootstrap/Card';

const CalendarView = () => (
  <Card className="calendar-card border-0">
    <Card.Body>
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4">
        <div>
          <Card.Title as="h2" className="h4 mb-1 text-primary fw-semibold">
            Calendario de formaciones
          </Card.Title>
          <Card.Subtitle className="text-secondary">
            Consulta por mes, semana, día o vista agenda.
          </Card.Subtitle>
        </div>
      </div>
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
        }}
        height="auto"
        weekends
        selectable={false}
        editable={false}
        slotDuration="00:30:00"
        nowIndicator
        events={[]}
        locales={[esLocale]}
        locale="es"
      />
    </Card.Body>
  </Card>
);

export default CalendarView;
