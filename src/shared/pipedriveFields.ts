// src/shared/pipedriveFields.ts
export const PIPEDRIVE_FIELDS = {
  SEDE: '676d6bd51e52999c582c01f67c99a35ed30b...',       // reemplaza por tu ID real
  CAES: 'e1971bf3a21d48737b682bf8d864ddc5eb15a351',      // idem
  FUNDAE: '245d60d4d18aec40ba888998ef92e5d00e494583',    // idem
  HOTEL_PERNOCTA: 'c3a6daf8eb5b4e59c3c07cda8e01f43439101269', // idem
} as const

export type PipedriveFieldKey = keyof typeof PIPEDRIVE_FIELDS
export type PipedriveFieldId = typeof PIPEDRIVE_FIELDS[PipedriveFieldKey]
