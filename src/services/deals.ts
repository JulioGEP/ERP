// src/services/deals.ts
// Servicios tipados para consumir la API interna /api/deals
// Reemplaza el shim anterior y usa tipos estrictos

import { PIPEDRIVE_FIELDS } from '../shared/pipedriveFields'

export type DealProduct = {
  code: string
  name: string
  quantity: number
}

export type DealRecord = {
  id: number
  title: string
  value?: number
  pipeline_id?: number
  org_id?: number | null
  person_id?: number | null
  add_time?: string
  update_time?: string

  // Campos normalizados (custom Pipedrive)
  sede?: string | null
  hotel_pernocta?: boolean | null
  caes?: string | null
  fundae?: string | null
  deal_direction?: 'in' | 'out' | null

  products?: DealProduct[]
  products_form?: DealProduct[]
  products_extras?: DealProduct[]
}

// ==== Helpers HTTP internos ====

const GET = async <T>(url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`)
  return res.json() as Promise<T>
}

const POST = async <T>(url: string, body: any) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${url} -> ${res.status}`)
  return res.json() as Promise<T>
}

const DELETE = async <T>(url: string) => {
  const res = await fetch(url, { method: 'DELETE' })
  if (!res.ok) throw new Error(`DELETE ${url} -> ${res.status}`)
  return res.json() as Promise<T>
}

// ==== API functions usadas en el front ====

/**
 * Lista deals (por defecto pipeline_id=3, filtrados por productos form- en backend)
 */
export async function fetchDeals(params?: { pipelineId?: number; q?: string }) {
  const usp = new URLSearchParams()
  if (params?.pipelineId != null) usp.set('pipelineId', String(params.pipelineId))
  if (params?.q) usp.set('q', params.q)
  return GET<DealRecord[]>(`/api/deals?${usp.toString()}`)
}

/**
 * Obtiene un deal por id
 */
export async function fetchDealById(id: number) {
  return GET<DealRecord>(`/api/deals/${id}`)
}

/**
 * Elimina (lógicamente) un deal
 */
export async function deleteDeal(id: number) {
  return DELETE<{ ok: true }>(`/api/deals/${id}`)
}

/**
 * Fuerza sync de un deal con Pipedrive
 */
export async function syncDeal(id: number) {
  return POST<{ ok: true }>(`/api/deals/${id}/sync`, {})
}

// ==== Helpers de UI ====

export function splitDealProductsByCode(d: DealRecord) {
  const products = d.products ?? []
  const form = products.filter((p) => p.code?.startsWith('form-'))
  const extras = products.filter((p) => !p.code?.startsWith('form-'))
  return { form, extras }
}

export function countSessionsForProduct(d: DealRecord, code: string) {
  return (d.products ?? []).filter((p) => p.code === code).length
}

export function buildDealFormationLabels(d: DealRecord) {
  const labels: string[] = []
  if (d.sede) labels.push(`Sede: ${d.sede}`)
  if (d.hotel_pernocta) labels.push('Hotel incluido')
  if (d.caes) labels.push(`CAES: ${d.caes}`)
  if (d.fundae) labels.push('FUNDAE')
  return labels
}

// ==== Persistencia local simple (para UI offline) ====

const HIDDEN_KEY = 'hidden_deals_v1'
const MANUAL_KEY = 'manual_deals_v1'

export function loadHiddenDealIds() {
  return JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]') as number[]
}
export function persistHiddenDealIds(ids: number[]) {
  localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids))
}

export function loadStoredManualDeals() {
  return JSON.parse(localStorage.getItem(MANUAL_KEY) ?? '[]') as DealRecord[]
}
export function persistStoredManualDeals(list: DealRecord[]) {
  localStorage.setItem(MANUAL_KEY, JSON.stringify(list))
}

// ==== Compartidos (si en el futuro quieres sync con backend) ====

export async function fetchSharedHiddenDealIds() {
  return [] as number[]
}
export async function fetchSharedManualDeals() {
  return [] as DealRecord[]
}
