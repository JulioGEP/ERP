import { PIPEDRIVE_FIELDS } from '../shared/pipedriveFields'

// Cuando mapees un deal que viene de la API:
export type DealRecord = {
  id: number
  title: string
  sede?: string | null
  hotel_pernocta?: boolean | null
  caes?: string | null
  fundae?: string | null
  deal_direction?: 'in' | 'out' | null
}

function mapApiDeal(apiDeal: any): DealRecord {
  return {
    id: apiDeal.id,
    title: apiDeal.title,
    sede: apiDeal[PIPEDRIVE_FIELDS.SEDE],
    hotel_pernocta: apiDeal[PIPEDRIVE_FIELDS.HOTEL_PERNOCTA],
    caes: apiDeal[PIPEDRIVE_FIELDS.CAES],
    fundae: apiDeal[PIPEDRIVE_FIELDS.FUNDAE],
    deal_direction: apiDeal.deal_direction,
  }
}
