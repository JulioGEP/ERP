// src/services/attachments.ts
// Servicio tipado para consumir /api/attachments

export type Attachment = {
  id: number
  deal_id?: number
  file_name: string
  url: string
  add_time?: string
}

const GET = async <T>(url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`)
  return res.json() as Promise<T>
}

/**
 * Lista adjuntos de un deal
 */
export async function fetchAttachments(dealId: number) {
  return GET<Attachment[]>(`/api/attachments?dealId=${dealId}`)
}
