// src/shared/pipedriveFields.ts

/**
 * Campos personalizados de Pipedrive que usamos en los deals.
 * Se centralizan aquí para evitar duplicar "magic strings".
 */
export const DEAL_CF = {
  sede: "676d6bd51e52999c582c01f67c99a35ed30bf6ae",
  caes: "e1971bf3a21d48737b682bf8d864ddc5eb15a351",
  fundae: "245d60d4d18aec40ba888998ef92e5d00e494583",
  hotelPernocta: "c3a6daf8eb5b4e59c3c07cda8e01f43439101269",
  dealDirection: "8b2a7570f5ba8aa4754f061cd9dc92fd778376a7",
  horas: "38f11c8876ecde803a027fbf3c9041fda2ae7eb7",
} as const;

// Helper para obtener el valor de un campo personalizado desde un deal de Pipedrive
export function getCF<T = string>(
  deal: any,
  fieldKey: string
): T | null {
  if (!deal || !deal.custom_fields) return null;
  return (deal.custom_fields[fieldKey] as T) ?? null;
}
