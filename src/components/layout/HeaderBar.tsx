import Container from 'react-bootstrap/Container';
import Nav from 'react-bootstrap/Nav';
import Navbar from 'react-bootstrap/Navbar';
import Badge from 'react-bootstrap/Badge';

interface HeaderBarProps {
  activeKey: 'calendar' | 'backlog';
  onNavigate: (key: 'calendar' | 'backlog') => void;
}

const HeaderBar = ({ activeKey, onNavigate }: HeaderBarProps) => (
  <header className="app-header shadow-sm">
    <Navbar bg="white" className="py-3" expand="lg">
      <Container fluid>
        <Navbar.Brand className="d-flex align-items-center gap-2 fw-semibold text-uppercase text-primary">
          <img src="/favicon.svg" width="32" height="32" alt="GEP Group" />
          <span>GEP Group · Planificación</span>
        </Navbar.Brand>
        <div className="d-none d-lg-block">
          <Badge bg="primary" pill className="text-uppercase tracking-wide">
            Primera iteración
          </Badge>
        </div>
      </Container>
    </Navbar>
    <div className="border-top border-bottom bg-white">
      <Container fluid>
        <Nav
          activeKey={activeKey}
          onSelect={(eventKey) => {
            if (eventKey === 'calendar' || eventKey === 'backlog') {
              onNavigate(eventKey);
            }
          }}
          className="nav-tabs-clean"
          role="tablist"
        >
          <Nav.Item>
            <Nav.Link eventKey="calendar" role="tab">
              Calendario
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="backlog" role="tab">
              Sin fecha
            </Nav.Link>
          </Nav.Item>
        </Nav>
      </Container>
    </div>
  </header>
);

export default HeaderBar;
