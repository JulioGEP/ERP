import { useQuery } from '@tanstack/react-query';
import Alert from 'react-bootstrap/Alert';
import Badge from 'react-bootstrap/Badge';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Placeholder from 'react-bootstrap/Placeholder';
import Stack from 'react-bootstrap/Stack';
import Table from 'react-bootstrap/Table';
import { fetchDeals, DealRecord } from '../../services/deals.ts';

const renderRow = (deal: DealRecord) => (
  <tr key={deal.id}>
    <td className="fw-semibold text-primary">#{deal.id}</td>
    <td>{deal.title}</td>
    <td>{deal.clientName ?? 'Sin organización asociada'}</td>
    <td>{deal.sede ?? 'Sin sede definida'}</td>
    <td className="text-nowrap">
      {deal.formations.length > 0 ? (
        <Stack direction="horizontal" gap={2} className="flex-wrap">
          {deal.formations.map((name) => (
            <Badge key={name} bg="info" text="dark" className="px-3 py-2 rounded-pill">
              {name}
            </Badge>
          ))}
        </Stack>
      ) : (
        <span className="text-muted">Sin formaciones form-</span>
      )}
    </td>
  </tr>
);

const DealsBoard = () => {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['deals', 'stage-3'],
    queryFn: fetchDeals,
    staleTime: 1000 * 60
  });

  return (
    <Card className="deals-card border-0" role="region" aria-live="polite">
      <Card.Body>
        <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4">
          <div>
            <Card.Title as="h2" className="h4 mb-1 text-primary fw-semibold">
              Presupuestos sin fecha asignada
            </Card.Title>
            <Card.Subtitle className="text-secondary">
              Embudo 3 · datos actualizados desde Pipedrive.
            </Card.Subtitle>
          </div>
          <Button variant="outline-primary" onClick={() => refetch()}>
            Recargar datos
          </Button>
        </div>

        {isError && (
          <Alert variant="danger" className="mb-4" role="alert">
            Ocurrió un error al sincronizar los presupuestos.
            <div className="small text-muted">{error instanceof Error ? error.message : 'Intenta de nuevo más tarde.'}</div>
          </Alert>
        )}

        <div className="table-responsive">
          <Table hover className="align-middle mb-0">
            <thead>
              <tr>
                <th scope="col">Presupuesto</th>
                <th scope="col">Título</th>
                <th scope="col">Cliente</th>
                <th scope="col">Sede</th>
                <th scope="col">Formación</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <>
                  {Array.from({ length: 4 }).map((_, index) => (
                    <tr key={`skeleton-${index}`}>
                      {Array.from({ length: 5 }).map((__, cell) => (
                        <td key={cell}>
                          <Placeholder animation="wave" xs={12} className="rounded-pill" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              )}

              {!isLoading && data && data.length > 0 && data.map(renderRow)}
            </tbody>
          </Table>
        </div>

        {!isLoading && data && data.length === 0 && !isError && (
          <div className="text-center py-5 text-secondary">
            <p className="fw-semibold">No hay presupuestos en el embudo seleccionado.</p>
            <p className="mb-0">En cuanto un presupuesto se marque como ganado en Pipedrive, aparecerá automáticamente aquí.</p>
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default DealsBoard;
