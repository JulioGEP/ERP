import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import Card from 'react-bootstrap/Card';
import { CalendarEvent } from '../../services/calendar';

interface CalendarViewProps {
  events: CalendarEvent[];
}

const buildEventTitle = (event: CalendarEvent) => {
  const segments = [event.productName];

  if (event.attendees != null) {
    segments.push(`${event.attendees} alumno${event.attendees === 1 ? '' : 's'}`);
  }

  if (event.sede) {
    segments.push(event.sede);
  }

  return segments.join(' · ');
};

const CalendarView = ({ events }: CalendarViewProps) => (
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
          slotMinTime="00:00:00"
          scrollTime="06:00:00"
          height="parent"
          nowIndicator
          events={events.map((event) => ({
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
              address: event.address
            }
          }))}
          locales={[esLocale]}
          locale="es"
        />
      </div>
    </Card.Body>
  </Card>
);

export default CalendarView;
