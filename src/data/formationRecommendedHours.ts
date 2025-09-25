const normalizeFormationLabel = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const formationHoursEntries: Array<[string, number]> = [
  ['Uso de extintores portátiles', 4],
  ['Formación uso de extintores', 4],
  ['Extintores y agentes extintores', 4],
  ['Formación básica contra incendios', 8],
  ['Formación avanzada contra incendios', 16],
  ['Formación reciclaje contra incendios', 4],
  ['Lucha contra incendios nivel básico', 8],
  ['Lucha contra incendios nivel medio', 12],
  ['Lucha contra incendios nivel avanzado', 16],
  ['Autoprotección y emergencias', 8],
  ['Plan de autoprotección', 12],
  ['Planes de autoprotección', 12],
  ['Simulacro de emergencia', 4],
  ['Simulacros de emergencia', 4],
  ['BIEs y mangueras', 4],
  ['Manejo de BIE', 4],
  ['Equipos de emergencia BIE', 4],
  ['Equipo de intervención', 8],
  ['Equipos de intervención', 8],
  ['ERA (equipo de respiración autónoma)', 8],
  ['Equipos de respiración autónoma', 8],
  ['Prácticas ERA', 6],
  ['Espacios confinados', 8],
  ['Trabajos en altura', 8],
  ['Rescate en altura', 12],
  ['Rescate vertical', 12],
  ['Rescate en espacios confinados', 12],
  ['Prevención de riesgos en altura', 6],
  ['Primeros auxilios', 6],
  ['Primeros auxilios avanzados', 8],
  ['Primeros auxilios y DEA', 8],
  ['Desfibrilador DEA', 4],
  ['Riesgo eléctrico', 6],
  ['Prevención de riesgos eléctricos', 6],
  ['Carretillas elevadoras', 8],
  ['Carretillas elevadoras y plataforma elevadora', 12],
  ['Plataformas elevadoras móviles de personal', 8],
  ['Grúa puente', 8],
  ['Operador de grúa puente', 8],
  ['Manipulación de mercancías peligrosas', 12],
  ['Materiales peligrosos', 12],
  ['Control de derrames de hidrocarburos', 8],
  ['Plan de evacuación', 4],
  ['Planes de evacuación', 4],
  ['Investigación de incendios', 8],
  ['Puesto de mando avanzado', 6],
  ['Comunicaciones de emergencia', 4],
  ['Incendios industriales', 12],
  ['Incendios forestales', 12],
  ['Uso de hidrantes', 4],
  ['Logística de emergencias', 6]
];

const patternRules: Array<{ pattern: RegExp; hours: number }> = [
  { pattern: /\breciclaj/, hours: 4 },
  { pattern: /\bbasi(?:co|ca)\b/, hours: 8 },
  { pattern: /\bavanzad/, hours: 16 },
  { pattern: /\brefresc/, hours: 4 },
  { pattern: /\bintroductori/, hours: 4 },
  { pattern: /espacios?\s+confinad/, hours: 8 },
  { pattern: /altura/, hours: 8 },
  { pattern: /rescate/, hours: 12 },
  { pattern: /primeros?\s+auxilio/, hours: 6 },
  { pattern: /desfibrilador|dea/, hours: 4 },
  { pattern: /extintor/, hours: 4 },
  { pattern: /\bbie\b/, hours: 4 },
  { pattern: /manguer/, hours: 4 },
  { pattern: /autoproteccion/, hours: 8 },
  { pattern: /plan\s+de\s+autoproteccion/, hours: 12 },
  { pattern: /carretill/, hours: 8 },
  { pattern: /plataforma\s+elevadora/, hours: 8 },
  { pattern: /grua|puente\s+grua/, hours: 8 },
  { pattern: /material(es)?\s+peligros/, hours: 12 },
  { pattern: /riesg[oa]\s+electric/, hours: 6 },
  { pattern: /hidrante/, hours: 4 }
];

const directHours = new Map<string, number>();
formationHoursEntries.forEach(([label, hours]) => {
  directHours.set(normalizeFormationLabel(label), hours);
});

const HOURS_LABEL_PATTERN = /(\d+(?:[.,]\d+)?)\s*(?:h|horas?|hrs?)/i;

const extractHoursFromText = (value: string): number | null => {
  const match = HOURS_LABEL_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  const parsed = Number.parseFloat(match[1].replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

export const resolveFormationRecommendedHours = (
  value: string | null | undefined
): number | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = normalizeFormationLabel(value);
  if (!normalized) {
    return null;
  }

  const direct = directHours.get(normalized);
  if (direct !== undefined) {
    return direct;
  }

  for (const rule of patternRules) {
    if (rule.pattern.test(normalized)) {
      return rule.hours;
    }
  }

  return extractHoursFromText(value);
};

export const resolveFormationRecommendedHoursFromList = (
  values: Array<string | null | undefined>
): number | null => {
  for (const value of values) {
    const resolved = resolveFormationRecommendedHours(value);
    if (resolved != null) {
      return resolved;
    }
  }

  return null;
};

export const formationRecommendedHoursCatalog = Object.freeze(
  Array.from(directHours.entries()).reduce<Record<string, number>>((accumulator, [key, value]) => {
    accumulator[key] = value;
    return accumulator;
  }, {})
);

