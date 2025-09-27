import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'
import Modal from 'react-bootstrap/Modal'
import Spinner from 'react-bootstrap/Spinner'
import Stack from 'react-bootstrap/Stack'
import Table from 'react-bootstrap/Table'
import { CalendarEvent } from '../../services/calendar'
import {
  ImportedDealRecord,
  fetchImportedDeals,
  importDealById,
} from '../../services/deals'

interface DealsBoardProps {
  events: CalendarEvent[]
  onUpdateSchedule: (dealId: number, events: CalendarEvent[]) => void
  dealIdFilter: string
  onDealIdFilterChange: (value: string) => void
  onDealNotFound: (dealId: number) => void
  onKnownDealIdsChange: (dealIds: number[]) => void
}

const DealsBoard = ({
  dealIdFilter,
  onDealIdFilterChange,
  onKnownDealIdsChange,
}: DealsBoardProps) => {
  const [deals, setDeals] = useState<ImportedDealRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [importValue, setImportValue] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  const loadDeals = useCallback(async () => {
    try {
      setIsLoading(true)
      setLoadError(null)
      const response = await fetchImportedDeals()
      setDeals(response)
      onKnownDealIdsChange(response.map((deal) => deal.id))
    } catch (error) {
      console.error('No se pudieron cargar los presupuestos importados', error)
      setLoadError(
        error instanceof Error
          ? error.message
          : 'No se pudieron cargar los presupuestos. Inténtalo de nuevo más tarde.'
      )
    } finally {
      setIsLoading(false)
    }
  }, [onKnownDealIdsChange])

  useEffect(() => {
    void loadDeals()
  }, [loadDeals])

  const handleOpenModal = useCallback(() => {
    setImportError(null)
    setImportValue('')
    setIsModalOpen(true)
  }, [])

  const handleCloseModal = useCallback(() => {
    if (isImporting) {
      return
    }

    setIsModalOpen(false)
    setImportError(null)
    setImportValue('')
  }, [isImporting])

  const handleImportSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      const trimmed = importValue.trim()
      const parsed = Number(trimmed)

      if (!Number.isFinite(parsed) || parsed <= 0) {
        setImportError('Introduce un número de presupuesto válido.')
        return
      }

      try {
        setIsImporting(true)
        setImportError(null)
        await importDealById(parsed)
        await loadDeals()
        setIsModalOpen(false)
        setImportValue('')
      } catch (error) {
        console.error('No se pudo importar el presupuesto', error)
        setImportError(
          error instanceof Error
            ? error.message
            : 'No se pudo importar el presupuesto. Inténtalo de nuevo más tarde.'
        )
      } finally {
        setIsImporting(false)
      }
    },
    [importValue, loadDeals]
  )

  const filteredDeals = useMemo(() => {
    const normalized = dealIdFilter.trim().toLowerCase()
    if (!normalized) {
      return deals
    }

    return deals.filter((deal) => {
      const dealIdMatches = String(deal.pipedriveId).includes(normalized)
      const titleMatches = deal.title.toLowerCase().includes(normalized)
      const clientMatches = (deal.clientName ?? '').toLowerCase().includes(normalized)
      return dealIdMatches || titleMatches || clientMatches
    })
  }, [dealIdFilter, deals])

  return (
    <Stack gap={3}>
      <Stack direction="horizontal" gap={2} className="flex-wrap">
        <Button variant="primary" onClick={handleOpenModal}>
          Subir Presupuesto
        </Button>
        <Form className="ms-lg-auto mt-3 mt-lg-0">
          <Form.Control
            value={dealIdFilter}
            onChange={(event) => onDealIdFilterChange(event.currentTarget.value)}
            placeholder="Buscar por número, título o cliente"
            aria-label="Buscar presupuesto"
          />
        </Form>
      </Stack>

      {loadError && <Alert variant="danger">{loadError}</Alert>}

      <div className="table-responsive">
        <Table striped hover responsive>
          <thead>
            <tr>
              <th style={{ width: '12%' }}>Deal</th>
              <th style={{ width: '30%' }}>Título</th>
              <th style={{ width: '25%' }}>Cliente</th>
              <th>Productos</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && deals.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-center text-muted">
                  <Spinner animation="border" size="sm" className="me-2" />
                  Cargando presupuestos...
                </td>
              </tr>
            ) : filteredDeals.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-center text-muted">
                  {dealIdFilter.trim()
                    ? 'No hay presupuestos que coincidan con la búsqueda.'
                    : 'Aún no se ha importado ningún presupuesto.'}
                </td>
              </tr>
            ) : (
              filteredDeals.map((deal) => (
                <tr key={deal.id}>
                  <td>{deal.pipedriveId}</td>
                  <td>{deal.title}</td>
                  <td>{deal.clientName ?? '—'}</td>
                  <td>
                    {deal.products.length === 0 ? (
                      <span className="text-muted">Sin productos</span>
                    ) : (
                      <ul className="mb-0 ps-3">
                        {deal.products.map((product) => {
                          const quantityLabel = product.quantity > 1 ? ` x${product.quantity}` : ''
                          const key = `${product.code}-${product.name}`
                          return (
                            <li key={key}>
                              {product.name}
                              {quantityLabel}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </div>

      <Modal show={isModalOpen} onHide={handleCloseModal} centered>
        <Form onSubmit={handleImportSubmit}>
          <Modal.Header closeButton={!isImporting}>
            <Modal.Title>Importar presupuesto</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Stack gap={3}>
              <p className="mb-0 text-muted">
                Introduce el número del presupuesto en Pipedrive que quieres importar.
              </p>
              <Form.Group controlId="importDealId">
                <Form.Label>Número de presupuesto</Form.Label>
                <Form.Control
                  type="number"
                  min={1}
                  required
                  value={importValue}
                  onChange={(event) => setImportValue(event.currentTarget.value)}
                  disabled={isImporting}
                />
              </Form.Group>
              {importError && <Alert variant="danger" className="mb-0">{importError}</Alert>}
            </Stack>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={handleCloseModal} disabled={isImporting}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={isImporting}>
              {isImporting ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  Importando...
                </>
              ) : (
                'Importar'
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </Stack>
  )
}

export default DealsBoard
