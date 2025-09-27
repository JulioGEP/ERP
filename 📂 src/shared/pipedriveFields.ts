// src/shared/pipedriveFields.ts
// Mapa de campos custom de Pipedrive → claves internas normalizadas

export const PIPEDRIVE_FIELDS = {
  SEDE: '676d6bd51e52999c582c01f67c99a35ed30b...',
  CAES: 'e1971bf3a21d48737b682bf8d864ddc5eb15a351',
  FUNDAE: '245d60d4d18aec40ba888998ef92e5d00e494583',
  HOTEL_PERNOCTA: 'c3a6daf8eb5b4e59c3c07cda8e01f43439101269',
  // Si hay más campos, añade aquí
} as const

// Tipado (para más seguridad en el front/back)
export type PipedriveFieldKey = keyof typeof PIPEDRIVE_FIELDS
export type PipedriveFieldId = typeof PIPEDRIVE_FIELDS[PipedriveFieldKey]
