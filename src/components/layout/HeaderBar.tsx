import Container from 'react-bootstrap/Container';
import Nav from 'react-bootstrap/Nav';
import Navbar from 'react-bootstrap/Navbar';
import logo from '../../styles/GEP-Group_Logotipo_horizontal.png';

interface HeaderBarProps {
  activeKey: 'calendar' | 'backlog';
  onNavigate: (key: 'calendar' | 'backlog') => void;
}

const HeaderBar = ({ activeKey, onNavigate }: HeaderBarProps) => (
  <header className="app-header shadow-sm">
    <Navbar bg="white" className="py-3" expand="lg">
      <Container fluid>
        <Navbar.Brand className="d-flex align-items-center gap-3">
          <img src={logo} alt="GEP Group" height={40} />
          <span>GEP Group - ERP</span>
        </Navbar.Brand>
      </Container>
    </Navbar>
    <div className="app-header-nav">
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
              Presupuestos
            </Nav.Link>
          </Nav.Item>
        </Nav>
      </Container>
    </div>
  </header>
);

export default HeaderBar;
