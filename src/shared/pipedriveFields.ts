// src/shared/pipedriveFields.ts
// Mapa centralizado de IDs de campos custom de Pipedrive.
// Sustituye los valores por los IDs REALES de tu Pipedrive cuando quieras mapearlos exactamente.

export const PIPEDRIVE_FIELDS = {
  // ejemplo de IDs reales (pon los tuyos):
  SEDE: 'custom_field_id_for_sede',                 // p.ej. "676d6bd51e52999c582c01f67c99a35ed30b12345"
  CAES: 'custom_field_id_for_caes',                 // p.ej. "e1971bf3a21d48737b682bf8d864ddc5eb15a351"
  FUNDAE: 'custom_field_id_for_fundae',             // p.ej. "245d60d4d18aec40ba888998ef92e5d00e494583"
  HOTEL_PERNOCTA: 'custom_field_id_for_hotel',      // p.ej. "c3a6daf8eb5b4e59c3c07cda8e01f43439101269"
} as const

export type PipedriveFieldKey = keyof typeof PIPEDRIVE_FIELDS
export type PipedriveFieldId = typeof PIPEDRIVE_FIELDS[PipedriveFieldKey]
