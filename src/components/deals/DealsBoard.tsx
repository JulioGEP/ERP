import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Badge from 'react-bootstrap/Badge';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Placeholder from 'react-bootstrap/Placeholder';
import Stack from 'react-bootstrap/Stack';
import Table from 'react-bootstrap/Table';
import { CalendarEvent } from '../../services/calendar';
import { fetchDealById, fetchDeals, DealRecord } from '../../services/deals';
import DealDetailModal from './DealDetailModal';

const skeletonColumnCount = 6;
const skeletonRows = Array.from({ length: 4 }, (_, index) => (
  <tr key={`skeleton-${index}`}>
    {Array.from({ length: skeletonColumnCount }).map((__, cell) => (
      <td key={cell}>
        <Placeholder animation="wave" xs={12} className="rounded-pill" />
      </td>
    ))}
  </tr>
));

type FeedbackState = { type: 'success' | 'error'; message: string } | null;
type SortField = 'id' | 'wonDate' | 'title' | 'clientName' | 'sede' | 'formations';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

interface DealsBoardProps {
  events: CalendarEvent[];
  onUpdateSchedule: (dealId: number, events: CalendarEvent[]) => void;
}

const DealsBoard = ({ events, onUpdateSchedule }: DealsBoardProps) => {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [selectedDealId, setSelectedDealId] = useState<number | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ field: 'wonDate', direction: 'desc' });
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['deals', 'stage-3'],
    queryFn: fetchDeals,
    staleTime: 1000 * 60
  });

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('es-ES', {
        dateStyle: 'medium'
      }),
    []
  );

  const fallbackClientName = 'Sin organización asociada';
  const fallbackSede = 'Sin sede definida';
  const fallbackFormationsLabel = 'Sin formaciones form-';

  const formatDealDate = (value: string | null) => {
    if (!value) {
      return 'Sin fecha';
    }

    const timestamp = Date.parse(value);

    if (Number.isNaN(timestamp)) {
      return value;
    }

    return dateFormatter.format(new Date(timestamp));
  };

  const sortedDeals = useMemo<DealRecord[]>(() => {
    if (!data) {
      return [];
    }

    const items = [...data];
    const { field, direction } = sortConfig;
    const multiplier = direction === 'asc' ? 1 : -1;

    const normaliseString = (input: string | null | undefined) => (input ?? '').trim();

    const compareStrings = (
      firstValue: string | null | undefined,
      secondValue: string | null | undefined
    ) => normaliseString(firstValue).localeCompare(normaliseString(secondValue), 'es', { sensitivity: 'base' });

    const parseDateForSort = (value: string | null) => {
      if (!value) {
        return Number.NEGATIVE_INFINITY;
      }

      const timestamp = Date.parse(value);
      return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
    };

    items.sort((first, second) => {
      let comparison = 0;

      switch (field) {
        case 'id':
          comparison = first.id - second.id;
          break;
        case 'wonDate':
          comparison = parseDateForSort(first.wonDate) - parseDateForSort(second.wonDate);
          break;
        case 'title':
          comparison = compareStrings(first.title, second.title);
          break;
        case 'clientName':
          comparison = compareStrings(first.clientName ?? fallbackClientName, second.clientName ?? fallbackClientName);
          break;
        case 'sede':
          comparison = compareStrings(first.sede ?? fallbackSede, second.sede ?? fallbackSede);
          break;
        case 'formations': {
          const firstLabel =
            first.formations.length > 0 ? first.formations.join(', ') : fallbackFormationsLabel;
          const secondLabel =
            second.formations.length > 0 ? second.formations.join(', ') : fallbackFormationsLabel;
          comparison = compareStrings(firstLabel, secondLabel);
          break;
        }
        default:
          comparison = 0;
      }

      if (comparison === 0) {
        comparison = first.id - second.id;
      }

      return comparison * multiplier;
    });

    return items;
  }, [data, sortConfig, fallbackClientName, fallbackFormationsLabel, fallbackSede]);

  const handleSort = (field: SortField) => {
    setSortConfig((current) => {
      if (current.field === field) {
        return { field, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }

      const defaultDirection: SortDirection = field === 'id' || field === 'wonDate' ? 'desc' : 'asc';
      return { field, direction: defaultDirection };
    });
  };

  const getAriaSort = (field: SortField): 'ascending' | 'descending' | undefined => {
    if (sortConfig.field !== field) {
      return undefined;
    }

    return sortConfig.direction === 'asc' ? 'ascending' : 'descending';
  };

  const renderSortButton = (label: string, field: SortField) => {
    const isActive = sortConfig.field === field;
    const direction = isActive ? sortConfig.direction : null;

    return (
      <button
        type="button"
        className="table-sort-button"
        onClick={() => handleSort(field)}
        aria-label={`Ordenar por ${label}`}
      >
        <span>{label}</span>
        {direction && (
          <span className="table-sort-indicator" aria-hidden="true">
            {direction === 'asc' ? '▲' : '▼'}
          </span>
        )}
      </button>
    );
  };

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
              <Button variant="outline-primary" onClick={() => refetch()} disabled={isFetching && !isLoading}>
                {isFetching && !isLoading ? 'Recargando…' : 'Recargar datos'}
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
                  <th scope="col" aria-sort={getAriaSort('id')}>
                    {renderSortButton('Presupuesto', 'id')}
                  </th>
                  <th scope="col" aria-sort={getAriaSort('wonDate')}>
                    {renderSortButton('Fecha de ganado', 'wonDate')}
                  </th>
                  <th scope="col" aria-sort={getAriaSort('title')}>
                    {renderSortButton('Título', 'title')}
                  </th>
                  <th scope="col" aria-sort={getAriaSort('clientName')}>
                    {renderSortButton('Cliente', 'clientName')}
                  </th>
                  <th scope="col" aria-sort={getAriaSort('sede')}>
                    {renderSortButton('Sede', 'sede')}
                  </th>
                  <th scope="col" aria-sort={getAriaSort('formations')}>
                    {renderSortButton('Formación', 'formations')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading && skeletonRows}

                {!isLoading && sortedDeals.length > 0 &&
                  sortedDeals.map((deal) => (
                    <tr
                      key={deal.id}
                      role="button"
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleSelectDeal(deal.id)}
                    >
                      <td className="fw-semibold text-primary">#{deal.id}</td>
                      <td className="text-nowrap">{formatDealDate(deal.wonDate)}</td>
                      <td>{deal.title}</td>
                      <td>{deal.clientName ?? fallbackClientName}</td>
                      <td>{deal.sede ?? fallbackSede}</td>
                      <td>
                        {deal.formations.length > 0 ? (
                          <Stack direction="horizontal" gap={2} className="flex-wrap">
                            {deal.formations.map((name) => (
                              <Badge key={name} bg="info" text="dark" className="px-3 py-2 rounded-pill">
                                {name}
                              </Badge>
                            ))}
                          </Stack>
                        ) : (
                          <span className="text-muted">{fallbackFormationsLabel}</span>
                        )}
                      </td>
                    </tr>
                  ))}
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
