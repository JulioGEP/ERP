import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Badge from 'react-bootstrap/Badge';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Placeholder from 'react-bootstrap/Placeholder';
import Stack from 'react-bootstrap/Stack';
import Table from 'react-bootstrap/Table';
import Form from 'react-bootstrap/Form';
import { CalendarEvent } from '../../services/calendar';
import { fetchDealById, fetchDeals, DealRecord } from '../../services/deals';
import DealDetailModal from './DealDetailModal';

const skeletonRows = Array.from({ length: 4 }, (_, index) => (
  <tr key={`skeleton-${index}`}>
    {Array.from({ length: 5 }).map((__, cell) => (
      <td key={cell}>
        <Placeholder animation="wave" xs={12} className="rounded-pill" />
      </td>
    ))}
  </tr>
));

type FeedbackState = { type: 'success' | 'error'; message: string } | null;

interface DealsBoardProps {
  events: CalendarEvent[];
  onUpdateSchedule: (dealId: number, events: CalendarEvent[]) => void;
}

const DealsBoard = ({ events, onUpdateSchedule }: DealsBoardProps) => {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [selectedDealId, setSelectedDealId] = useState<number | null>(null);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['deals', 'stage-3'],
    queryFn: fetchDeals,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);

  const uploadDeal = useMutation({
    mutationFn: fetchDealById,
    onSuccess: (deal) => {
      setFeedback({
        type: 'success',
        message: `Presupuesto #${deal.id} sincronizado correctamente.`
      });

      queryClient.setQueryData<DealRecord[]>(['deals', 'stage-3'], (previous) => {
        const current = previous ?? [];
        const filtered = current.filter((item) => item.id !== deal.id);
        return [deal, ...filtered];
      });
    },
    onError: (mutationError: unknown) => {
      setFeedback({
        type: 'error',
        message:
          mutationError instanceof Error
            ? mutationError.message
            : 'No se pudo cargar el presupuesto especificado.'
      });
    }
  });

  const handleUploadDeal = async () => {
    const rawId = window.prompt('Introduce el ID del presupuesto que deseas subir');

    if (!rawId) {
      return;
    }

    const trimmed = rawId.trim();
    const dealId = Number.parseInt(trimmed, 10);

    if (!Number.isFinite(dealId)) {
      setFeedback({
        type: 'error',
        message: 'Debes introducir un identificador numérico válido.'
      });
      return;
    }

    setFeedback(null);

    try {
      await uploadDeal.mutateAsync(dealId);
    } catch (mutationError) {
      console.error('No se pudo subir el presupuesto indicado', mutationError);
    }
  };

  const handleSelectDeal = (dealId: number) => {
    setSelectedDealId(dealId);
  };

  const handleCloseModal = () => {
    setSelectedDealId(null);
  };

  useEffect(() => {
    if (!data || data.length === 0) {
      setCurrentPage(1);
      return;
    }

    const totalAvailablePages = Math.max(1, Math.ceil(data.length / pageSize));
    setCurrentPage((previous) => (previous > totalAvailablePages ? totalAvailablePages : previous));
  }, [data, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [pageSize]);

  const totalPages = useMemo(() => {
    if (!data || data.length === 0) {
      return 1;
    }

    return Math.max(1, Math.ceil(data.length / pageSize));
  }, [data, pageSize]);

  const pageNumbers = useMemo(() => Array.from({ length: totalPages }, (_, index) => index + 1), [totalPages]);

  const paginatedDeals = useMemo(() => {
    if (!data) {
      return [];
    }

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return data.slice(startIndex, endIndex);
  }, [currentPage, data, pageSize]);

  const selectedDeal = useMemo(() => {
    if (!selectedDealId || !data) {
      return null;
    }

    return data.find((deal) => deal.id === selectedDealId) ?? null;
  }, [data, selectedDealId]);

  return (
    <>
      <Card className="deals-card border-0" role="region" aria-live="polite">
        <Card.Body>
          <div className="d-flex justify-content-end mb-4">
            <Stack direction="horizontal" gap={2}>
              <Button variant="primary" onClick={handleUploadDeal} disabled={uploadDeal.isPending}>
                {uploadDeal.isPending ? 'Subiendo…' : 'Subir Deal'}
              </Button>
            </Stack>
          </div>

          {feedback && (
            <Alert
              variant={feedback.type === 'success' ? 'success' : 'danger'}
              dismissible
              onClose={() => setFeedback(null)}
              className="mb-4"
              role="alert"
            >
              {feedback.message}
            </Alert>
          )}

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
                {isLoading && skeletonRows}

                {!isLoading && paginatedDeals.length > 0 &&
                  paginatedDeals.map((deal) => (
                    <tr
                      key={deal.id}
                      role="button"
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleSelectDeal(deal.id)}
                    >
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
                  ))}
              </tbody>
            </Table>
          </div>

          {!isLoading && data && data.length > 0 && (
            <div className="d-flex justify-content-end align-items-center gap-3 flex-wrap mt-3">
              <div className="d-flex align-items-center gap-2">
                <span className="text-muted small">Por página:</span>
                <Form.Select
                  size="sm"
                  aria-label="Seleccionar número de presupuestos por página"
                  value={pageSize}
                  onChange={(event) => setPageSize(Number.parseInt(event.target.value, 10))}
                  style={{ maxWidth: '120px' }}
                >
                  {[25, 50, 75, 100].map((option) => (
                    <option key={`page-size-${option}`} value={option}>
                      {option}
                    </option>
                  ))}
                </Form.Select>
              </div>

              <Stack direction="horizontal" gap={1} className="flex-wrap">
                <Button
                  variant="outline-primary"
                  size="sm"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  {'<<'}
                </Button>
                <Button
                  variant="outline-primary"
                  size="sm"
                  onClick={() => setCurrentPage((previous) => Math.max(1, previous - 1))}
                  disabled={currentPage === 1}
                >
                  {'<'}
                </Button>
                {pageNumbers.map((pageNumber) => (
                  <Button
                    key={`page-${pageNumber}`}
                    variant={pageNumber === currentPage ? 'primary' : 'outline-primary'}
                    size="sm"
                    onClick={() => setCurrentPage(pageNumber)}
                  >
                    {pageNumber}
                  </Button>
                ))}
                <Button
                  variant="outline-primary"
                  size="sm"
                  onClick={() => setCurrentPage((previous) => Math.min(totalPages, previous + 1))}
                  disabled={currentPage === totalPages}
                >
                  {'>'}
                </Button>
                <Button
                  variant="outline-primary"
                  size="sm"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  {'>>'}
                </Button>
              </Stack>
            </div>
          )}

          {!isLoading && data && data.length === 0 && !isError && (
            <div className="text-center py-5 text-secondary">
              <p className="fw-semibold">No hay presupuestos en el embudo seleccionado.</p>
              <p className="mb-0">En cuanto un presupuesto se marque como ganado en Pipedrive, aparecerá automáticamente aquí.</p>
            </div>
          )}
        </Card.Body>
      </Card>

      {selectedDeal && (
        <DealDetailModal
          show
          deal={selectedDeal}
          onHide={handleCloseModal}
          events={events}
          onUpdateSchedule={onUpdateSchedule}
          onDealRefetch={async () => {
            try {
              const refreshed = await fetchDealById(selectedDeal.id);
              queryClient.setQueryData<DealRecord[]>(['deals', 'stage-3'], (previous) => {
                const current = previous ?? [];
                const filtered = current.filter((item) => item.id !== refreshed.id);
                return [refreshed, ...filtered];
              });
            } catch (refreshError) {
              console.error('No se pudo actualizar el deal seleccionado', refreshError);
            }
          }}
        />
      )}
    </>
  );
};

export default DealsBoard;
