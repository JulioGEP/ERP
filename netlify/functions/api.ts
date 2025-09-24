import type { Handler } from "@netlify/functions";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { getDealById } from "../../adapters/pipedrive";

type DealNote = {
  id: string;
  content: string;
  createdAt: string | null;
  authorName: string | null;
  source: "deal" | "product" | "local";
  productId: number | null;
  dealProductId: number | null;
};

type DealAttachment = {
  id: string;
  name: string;
  url: string;
  downloadUrl: string | null;
  fileType: string | null;
  addedAt: string | null;
  addedBy: string | null;
  source: "deal" | "product" | "local";
  productId: number | null;
  dealProductId: number | null;
};

type DealProduct = {
  dealProductId: number;
  productId: number | null;
  name: string;
  code: string | null;
  quantity: number;
  itemPrice: number | null;
  recommendedHours: number | null;
  recommendedHoursRaw: string | null;
  notes: DealNote[];
  attachments: DealAttachment[];
  isTraining: boolean;
};

type DealRecord = {
  id: number;
  title: string;
  clientId: number | null;
  clientName: string | null;
  sede: string | null;
  address: string | null;
  caes: string | null;
  fundae: string | null;
  hotelPernocta: string | null;
  pipelineId: number | null;
  pipelineName: string | null;
  wonDate: string | null;
  formations: string[];
  trainingProducts: DealProduct[];
  extraProducts: DealProduct[];
  notes: DealNote[];
  attachments: DealAttachment[];
};

type RelatedEntity = {
  id: number | null;
  name: string | null;
  address: string | null;
};

const toOptionalString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toStringWithFallback = (value: unknown, fallback: string): string =>
  toOptionalString(value) ?? fallback;

const toOptionalNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }

    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const normaliseRelatedEntity = (value: unknown): RelatedEntity => {
  if (value === null || value === undefined) {
    return { id: null, name: null, address: null };
  }

  if (typeof value === "number") {
    return { id: Number.isFinite(value) ? value : null, name: null, address: null };
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return { id: parsed, name: null, address: null };
    }

    return { id: null, name: toOptionalString(value), address: null };
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const id = toOptionalNumber(record.value ?? record.id);
    const name = toOptionalString(record.name);
    const address = toOptionalString(record.address);
    return { id, name, address };
  }

  return { id: null, name: null, address: null };
};

const readNestedString = (value: unknown, key: string): string | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  return toOptionalString(record[key]);
};

const normaliseComparisonText = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const toOptionalText = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
};

const toOptionalBoolean = (value: unknown): boolean | null => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }

    if (value === 0) {
      return false;
    }
  }

  if (typeof value === "string") {
    const normalized = normaliseComparisonText(value);

    if (normalized.length === 0) {
      return null;
    }

    if (["1", "true", "t", "yes", "y", "si", "s", "on"].includes(normalized)) {
      return true;
    }

    if (["0", "false", "f", "no", "n", "off"].includes(normalized)) {
      return false;
    }
  }

  return null;
};

const normaliseArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = ["items", "data", "values", "results"];

    for (const key of keys) {
      const nested = record[key];
      if (Array.isArray(nested)) {
        return nested;
      }
    }
  }

  return [];
};

const ensureId = (value: unknown, prefix: string, index: number): string => {
  const text = toOptionalText(value);
  if (text) {
    return text;
  }

  return `${prefix}-${index}`;
};

const toStringList = (value: unknown): string[] => {
  const set = new Set<string>();

  const pushValue = (input: string) => {
    input
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .forEach((item) => set.add(item));
  };

  const process = (entry: unknown) => {
    if (typeof entry === "string") {
      if (entry.trim().length > 0) {
        pushValue(entry);
      }
      return;
    }

    if (typeof entry === "number" && Number.isFinite(entry)) {
      pushValue(String(entry));
      return;
    }

    if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      const direct =
        record.value ?? record.name ?? record.label ?? record.text ?? record.title;

      if (typeof direct === "string" || typeof direct === "number") {
        process(direct);
      }

      const nestedKeys = ["options", "values", "items", "data"];
      nestedKeys.forEach((key) => {
        const nested = record[key];
        if (Array.isArray(nested)) {
          nested.forEach(process);
        }
      });
    }
  };

  if (Array.isArray(value)) {
    value.forEach(process);
  } else {
    process(value);
  }

  return Array.from(set);
};

const pushUniqueNote = (collection: DealNote[], note: DealNote) => {
  if (!collection.some((existing) => existing.id === note.id)) {
    collection.push(note);
  }
};

const pushUniqueAttachment = (collection: DealAttachment[], attachment: DealAttachment) => {
  if (!collection.some((existing) => existing.id === attachment.id)) {
    collection.push(attachment);
  }
};

const readValueByPath = (record: Record<string, unknown>, key: string): unknown => {
  const segments = key.split(".");
  let current: unknown = record;

  for (const segment of segments) {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
};

const collectProductRecords = (record: Record<string, unknown>): Record<string, unknown>[] => {
  const queue: Record<string, unknown>[] = [record];
  const result: Record<string, unknown>[] = [];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (visited.has(current)) {
      continue;
    }

    visited.add(current);
    result.push(current);

    const nestedKeys = [
      "product",
      "product_data",
      "productData",
      "product_details",
      "productDetails",
      "item",
      "product_item",
      "productItem",
      "details",
      "data"
    ];

    nestedKeys.forEach((key) => {
      const nested = (current as Record<string, unknown>)[key];
      if (nested && typeof nested === "object" && !Array.isArray(nested)) {
        queue.push(nested as Record<string, unknown>);
      }
    });

    const custom =
      (current as Record<string, unknown>).custom_fields ??
      (current as Record<string, unknown>).customFields;

    if (custom && typeof custom === "object" && !Array.isArray(custom)) {
      queue.push(custom as Record<string, unknown>);
    }
  }

  return result;
};

const findFirstValue = (records: Record<string, unknown>[], keys: string[]): unknown => {
  for (const record of records) {
    for (const key of keys) {
      const value = readValueByPath(record, key);

      if (value === undefined || value === null) {
        continue;
      }

      if (typeof value === "string" && value.trim().length === 0) {
        continue;
      }

      return value;
    }
  }

  return undefined;
};

const parseRecommendedHoursValue = (
  value: unknown
): { numeric: number | null; raw: string | null } => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { numeric: value, raw: String(value) };
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return { numeric: null, raw: null };
    }

    const normalized = trimmed.replace(/,/g, ".");
    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    const numeric = match ? Number.parseFloat(match[0]) : Number.NaN;

    return {
      numeric: Number.isFinite(numeric) ? numeric : null,
      raw: trimmed
    };
  }

  return { numeric: null, raw: null };
};

const parseRecommendedHours = (records: Record<string, unknown>[]) => {
  const valueCandidate = findFirstValue(records, [
    "recommended_hours",
    "recommendedHours",
    "recommended_hours_value",
    "horas_recomendadas",
    "horasRecomendadas",
    "hours",
    "duration_hours",
    "durationHours",
    "duration"
  ]);

  const textCandidate = findFirstValue(records, [
    "recommended_hours_text",
    "recommendedHoursText",
    "recommended_hours_raw",
    "recommendedHoursRaw",
    "horas_recomendadas_texto",
    "horasRecomendadasTexto",
    "recommended_hours_label",
    "recommendedHoursLabel"
  ]);

  let result = parseRecommendedHoursValue(valueCandidate);

  if (!result.raw && textCandidate !== undefined) {
    const textResult = parseRecommendedHoursValue(textCandidate);

    if (textResult.raw) {
      result = {
        numeric: result.numeric ?? textResult.numeric,
        raw: textResult.raw
      };
    }
  }

  if (!result.raw && valueCandidate !== undefined && typeof valueCandidate === "number") {
    result = {
      numeric: result.numeric ?? (Number.isFinite(valueCandidate) ? valueCandidate : null),
      raw: String(valueCandidate)
    };
  }

  return result;
};

const parsePipedriveNotes = (
  value: unknown,
  source: "deal" | "product",
  overrides: { productId: number | null; dealProductId: number | null },
  idPrefix: string
): DealNote[] => {
  const result: DealNote[] = [];
  const entries = normaliseArray(value);

  if (entries.length > 0) {
    entries.forEach((entry, index) => {
      if (!entry || typeof entry !== "object") {
        const text = toOptionalText(entry);
        if (!text) {
          return;
        }

        result.push({
          id: `${idPrefix}-${source}-note-${index}`,
          content: text,
          createdAt: null,
          authorName: null,
          source,
          productId: overrides.productId,
          dealProductId: overrides.dealProductId
        });
        return;
      }

      const record = entry as Record<string, unknown>;
      const id = ensureId(
        record.id ?? record.note_id ?? record.uuid ?? record.key,
        `${idPrefix}-${source}-note`,
        index
      );

      const content =
        toOptionalString(record.content) ??
        toOptionalString(record.note) ??
        toOptionalString(record.body) ??
        toOptionalString(record.text) ??
        toOptionalString(record.value) ??
        null;

      if (!content) {
        return;
      }

      const createdAt =
        toOptionalString(record.add_time) ??
        toOptionalString(record.created_at) ??
        toOptionalString(record.created) ??
        toOptionalString(record.timestamp) ??
        toOptionalString(record.date) ??
        null;

      const authorName =
        toOptionalString(record.user_name) ??
        toOptionalString(record.author_name) ??
        toOptionalString(record.added_by_user_name) ??
        readNestedString(record.user_id, "name") ??
        readNestedString(record.author, "name") ??
        readNestedString(record.added_by_user, "name") ??
        null;

      const productId =
        toOptionalNumber(record.product_id) ?? overrides.productId;

      const dealProductId =
        toOptionalNumber(record.deal_product_id) ?? overrides.dealProductId;

      result.push({
        id,
        content,
        createdAt,
        authorName,
        source,
        productId,
        dealProductId
      });
    });

    return result;
  }

  const text = toOptionalText(value);
  if (text) {
    result.push({
      id: `${idPrefix}-${source}-note-0`,
      content: text,
      createdAt: null,
      authorName: null,
      source,
      productId: overrides.productId,
      dealProductId: overrides.dealProductId
    });
  }

  return result;
};

const parsePipedriveAttachments = (
  value: unknown,
  source: "deal" | "product",
  overrides: { productId: number | null; dealProductId: number | null },
  idPrefix: string
): DealAttachment[] => {
  const result: DealAttachment[] = [];
  const entries = normaliseArray(value);

  if (entries.length > 0) {
    entries.forEach((entry, index) => {
      if (!entry || typeof entry !== "object") {
        const text = toOptionalText(entry);
        if (!text) {
          return;
        }

        result.push({
          id: `${idPrefix}-${source}-attachment-${index}`,
          name: text,
          url: text,
          downloadUrl: text,
          fileType: null,
          addedAt: null,
          addedBy: null,
          source,
          productId: overrides.productId,
          dealProductId: overrides.dealProductId
        });
        return;
      }

      const record = entry as Record<string, unknown>;
      const id = ensureId(
        record.id ?? record.file_id ?? record.uuid ?? record.key,
        `${idPrefix}-${source}-attachment`,
        index
      );

      const name =
        toOptionalText(record.name) ??
        toOptionalText(record.file_name) ??
        toOptionalText(record.title) ??
        toOptionalText(record.filename) ??
        `Archivo ${index + 1}`;

      const url =
        toOptionalString(record.url) ??
        toOptionalString(record.download_url) ??
        toOptionalString(record.link) ??
        toOptionalString(record.file_url) ??
        toOptionalString(record.view_url) ??
        "";

      const downloadUrl =
        toOptionalString(record.download_url) ??
        toOptionalString(record.url) ??
        toOptionalString(record.link) ??
        null;

      const fileType =
        toOptionalString(record.file_type) ??
        toOptionalString(record.content_type) ??
        toOptionalString(record.mime_type) ??
        toOptionalString(record.mimetype) ??
        null;

      const addedAt =
        toOptionalString(record.add_time) ??
        toOptionalString(record.created_at) ??
        toOptionalString(record.created) ??
        toOptionalString(record.updated_at) ??
        null;

      const addedBy =
        toOptionalString(record.user_name) ??
        toOptionalString(record.added_by_user_name) ??
        toOptionalString(record.author_name) ??
        readNestedString(record.user_id, "name") ??
        readNestedString(record.added_by_user, "name") ??
        null;

      const productId =
        toOptionalNumber(record.product_id) ?? overrides.productId;

      const dealProductId =
        toOptionalNumber(record.deal_product_id) ?? overrides.dealProductId;

      result.push({
        id,
        name: toStringWithFallback(name, `Archivo ${index + 1}`),
        url: url || downloadUrl || "",
        downloadUrl,
        fileType,
        addedAt,
        addedBy,
        source,
        productId,
        dealProductId
      });
    });

    return result;
  }

  const text = toOptionalText(value);
  if (text) {
    result.push({
      id: `${idPrefix}-${source}-attachment-0`,
      name: text,
      url: text,
      downloadUrl: text,
      fileType: null,
      addedAt: null,
      addedBy: null,
      source,
      productId: overrides.productId,
      dealProductId: overrides.dealProductId
    });
  }

  return result;
};

const parseDealProducts = (
  dealId: number,
  deal: Record<string, unknown>,
  noteAccumulator: DealNote[],
  attachmentAccumulator: DealAttachment[]
): DealProduct[] => {
  let fallbackCounter = 1;
  const generateFallbackId = () => -fallbackCounter++;

  const productSources: { value: unknown; defaultIsTraining: boolean | null }[] = [
    { value: deal["products"], defaultIsTraining: null },
    { value: deal["product_items"], defaultIsTraining: null },
    { value: deal["productItems"], defaultIsTraining: null },
    { value: deal["deal_products"], defaultIsTraining: null },
    { value: deal["dealProducts"], defaultIsTraining: null },
    { value: deal["items"], defaultIsTraining: null },
    { value: readValueByPath(deal, "product_data"), defaultIsTraining: null },
    { value: readValueByPath(deal, "productData"), defaultIsTraining: null },
    { value: readValueByPath(deal, "additional_data.products"), defaultIsTraining: null },
    { value: readValueByPath(deal, "additional_data.items"), defaultIsTraining: null },
    { value: readValueByPath(deal, "additionalData.products"), defaultIsTraining: null },
    { value: readValueByPath(deal, "additionalData.items"), defaultIsTraining: null },
    { value: deal["training_products"], defaultIsTraining: true },
    { value: deal["trainingProducts"], defaultIsTraining: true },
    { value: deal["extra_products"], defaultIsTraining: false },
    { value: deal["extraProducts"], defaultIsTraining: false }
  ];

  const productMap = new Map<number, DealProduct>();

  productSources.forEach(({ value, defaultIsTraining }) => {
    const entries = normaliseArray(value);

    entries.forEach((entry, index) => {
      if (!entry || typeof entry !== "object") {
        const text = toOptionalText(entry);
        if (!text) {
          return;
        }

        const generatedId = generateFallbackId();
        const product: DealProduct = {
          dealProductId: generatedId,
          productId: null,
          name: text,
          code: null,
          quantity: 0,
          itemPrice: null,
          recommendedHours: null,
          recommendedHoursRaw: null,
          notes: [],
          attachments: [],
          isTraining: defaultIsTraining ?? true
        };

        if (!productMap.has(product.dealProductId)) {
          productMap.set(product.dealProductId, product);
        }

        return;
      }

      const record = entry as Record<string, unknown>;
      const candidateRecords = collectProductRecords(record);

      const dealProductId =
        toOptionalNumber(
          findFirstValue([candidateRecords[0]], [
            "deal_product_id",
            "dealProductId",
            "id",
            "item_id",
            "itemId",
            "deal_item_id",
            "dealItemId"
          ])
        ) ?? generateFallbackId();

      const productIdValue = findFirstValue(candidateRecords, [
        "product_id",
        "productId",
        "product_id.value",
        "product_id.id",
        "product.id",
        "item.id"
      ]);
      const productId = toOptionalNumber(productIdValue);

      const nameValue = findFirstValue(candidateRecords, [
        "name",
        "product_name",
        "product.name",
        "item.name",
        "title",
        "product.title"
      ]);
      const name = toStringWithFallback(
        toOptionalText(nameValue) ?? `Producto ${dealProductId}`,
        `Producto ${dealProductId}`
      );

      const codeValue = findFirstValue(candidateRecords, [
        "code",
        "product_code",
        "product.code",
        "item.code",
        "sku",
        "sku_code"
      ]);
      const code = toOptionalText(codeValue);

      const quantityValue = findFirstValue(candidateRecords, [
        "quantity",
        "qty",
        "count",
        "sessions",
        "cantidad"
      ]);

      let quantity = 0;
      if (typeof quantityValue === "number" && Number.isFinite(quantityValue)) {
        quantity = quantityValue;
      } else if (typeof quantityValue === "string") {
        const parsed = Number.parseFloat(quantityValue.replace(/,/g, "."));
        if (Number.isFinite(parsed)) {
          quantity = parsed;
        }
      }

      const priceValue = findFirstValue(candidateRecords, [
        "item_price",
        "price",
        "unit_price",
        "unitPrice",
        "amount"
      ]);

      let itemPrice: number | null = null;
      if (typeof priceValue === "number" && Number.isFinite(priceValue)) {
        itemPrice = priceValue;
      } else if (typeof priceValue === "string") {
        const parsed = Number.parseFloat(priceValue.replace(/,/g, "."));
        itemPrice = Number.isFinite(parsed) ? parsed : null;
      }

      const recommended = parseRecommendedHours(candidateRecords);

      const productNotesRaw = findFirstValue(candidateRecords, [
        "notes",
        "note",
        "comments",
        "comment",
        "product_notes",
        "productNotes",
        "observaciones",
        "descripcion"
      ]);

      const productNotes = parsePipedriveNotes(
        productNotesRaw,
        "product",
        { productId: productId ?? null, dealProductId },
        `${dealId}-${dealProductId}-prod`
      );
      productNotes.forEach((note) => pushUniqueNote(noteAccumulator, note));

      const attachmentsRaw = findFirstValue(candidateRecords, [
        "files",
        "attachments",
        "documents",
        "product_files",
        "productFiles",
        "archivos"
      ]);

      const productAttachments = parsePipedriveAttachments(
        attachmentsRaw,
        "product",
        { productId: productId ?? null, dealProductId },
        `${dealId}-${dealProductId}-prod`
      );
      productAttachments.forEach((attachment) =>
        pushUniqueAttachment(attachmentAccumulator, attachment)
      );

      const trainingIndicatorValue = findFirstValue(candidateRecords, [
        "is_training",
        "isTraining",
        "training",
        "training_product",
        "trainingProduct",
        "es_formacion",
        "esFormacion",
        "formacion",
        "formación"
      ]);

      const extraIndicatorValue = findFirstValue(candidateRecords, [
        "is_extra",
        "isExtra",
        "extra",
        "extra_product",
        "extraProduct"
      ]);

      const typeIndicatorValue = findFirstValue(candidateRecords, [
        "type",
        "product_type",
        "category",
        "categoria",
        "group",
        "grupo"
      ]);

      let isTraining =
        toOptionalBoolean(trainingIndicatorValue) ??
        (() => {
          const text = toOptionalText(trainingIndicatorValue);
          if (!text) {
            return null;
          }

          const normalized = normaliseComparisonText(text);
          if (["training", "formacion", "formacion", "curso", "formativa"].some((token) =>
            normalized.includes(token)
          )) {
            return true;
          }

          if (["extra", "adicional", "complemento", "material", "otros"].some((token) =>
            normalized.includes(token)
          )) {
            return false;
          }

          return null;
        })();

      if (isTraining === null) {
        const extraBoolean = toOptionalBoolean(extraIndicatorValue);
        if (extraBoolean !== null) {
          isTraining = !extraBoolean;
        } else {
          const extraText = toOptionalText(extraIndicatorValue);
          if (extraText) {
            const normalized = normaliseComparisonText(extraText);
            if (["extra", "adicional", "complemento", "material", "otros"].some((token) =>
              normalized.includes(token)
            )) {
              isTraining = false;
            }
          }
        }
      }

      if (isTraining === null && typeIndicatorValue !== undefined) {
        const typeText = toOptionalText(typeIndicatorValue);
        if (typeText) {
          const normalized = normaliseComparisonText(typeText);
          if (["extra", "adicional", "complemento", "material", "otros"].some((token) =>
            normalized.includes(token)
          )) {
            isTraining = false;
          } else if (
            ["training", "formacion", "curso", "capacitacion", "formativa"].some((token) =>
              normalized.includes(token)
            )
          ) {
            isTraining = true;
          }
        }
      }

      if (isTraining === null) {
        isTraining = defaultIsTraining ?? true;
      }

      const product: DealProduct = {
        dealProductId,
        productId: productId ?? null,
        name,
        code,
        quantity,
        itemPrice,
        recommendedHours: recommended.numeric,
        recommendedHoursRaw: recommended.raw,
        notes: productNotes,
        attachments: productAttachments,
        isTraining
      };

      if (!productMap.has(product.dealProductId)) {
        productMap.set(product.dealProductId, product);
      } else {
        const existing = productMap.get(product.dealProductId)!;
        productMap.set(product.dealProductId, {
          ...existing,
          productId: existing.productId ?? product.productId,
          name: existing.name || product.name,
          code: existing.code ?? product.code,
          quantity: existing.quantity || product.quantity,
          itemPrice: existing.itemPrice ?? product.itemPrice,
          recommendedHours: existing.recommendedHours ?? product.recommendedHours,
          recommendedHoursRaw: existing.recommendedHoursRaw ?? product.recommendedHoursRaw,
          notes: existing.notes.length > 0 ? existing.notes : product.notes,
          attachments:
            existing.attachments.length > 0 ? existing.attachments : product.attachments,
          isTraining: existing.isTraining ?? product.isTraining
        });
      }
    });
  });

  return Array.from(productMap.values());
};

const parseDealFormations = (deal: Record<string, unknown>): string[] => {
  const formationCandidates = [
    deal["formations"],
    deal["formaciones"],
    deal["formacion"],
    deal["courses"],
    deal["course_names"],
    deal["training_formations"],
    deal["trainingFormations"],
    deal["deal_formations"],
    deal["dealFormations"],
    readValueByPath(deal, "custom_fields.formations"),
    readValueByPath(deal, "custom_fields.formaciones"),
    readValueByPath(deal, "customFields.formations"),
    readValueByPath(deal, "customFields.formaciones")
  ];

  const set = new Set<string>();

  formationCandidates.forEach((candidate) => {
    toStringList(candidate).forEach((item) => set.add(item));
  });

  return Array.from(set);
};

const mapPipedriveDealToRecord = (deal: Record<string, unknown>): DealRecord => {
  const dealId = toOptionalNumber(deal["id"]);

  if (dealId === null) {
    throw new Error("Pipedrive devolvió un deal sin identificador numérico");
  }

  const org = normaliseRelatedEntity(deal["org_id"]);
  const person = normaliseRelatedEntity(deal["person_id"]);

  const pipelineName =
    toOptionalString(deal["pipeline_name"]) ?? readNestedString(deal["pipeline"], "name");

  const address =
    toOptionalString(deal["org_address"]) ??
    readNestedString(deal["org_id"], "address") ??
    toOptionalString(deal["address"]);

  const clientName =
    toOptionalString(deal["org_name"]) ??
    org.name ??
    toOptionalString(deal["person_name"]) ??
    person.name;

  const wonDate =
    toOptionalString(deal["won_time"]) ??
    toOptionalString(deal["won_date"]) ??
    toOptionalString(deal["wonTime"]);

  const sede = toOptionalString(deal["sede"]);
  const caes = toOptionalString(deal["caes"]);
  const fundae = toOptionalString(deal["fundae"]);
  const hotelPernocta =
    toOptionalString(deal["hotelPernocta"]) ?? toOptionalString(deal["hotel_pernocta"]);

  const formations = parseDealFormations(deal);
  const notes: DealNote[] = [];
  const attachments: DealAttachment[] = [];

  const products = parseDealProducts(dealId, deal, notes, attachments);

  const noteSources: unknown[] = [
    deal["notes"],
    deal["deal_notes"],
    deal["extra_notes"],
    readValueByPath(deal, "additional_data.notes"),
    readValueByPath(deal, "notes.items")
  ];

  noteSources.forEach((value) => {
    const parsed = parsePipedriveNotes(
      value,
      "deal",
      { productId: null, dealProductId: null },
      `${dealId}`
    );
    parsed.forEach((note) => pushUniqueNote(notes, note));
  });

  const attachmentSources: unknown[] = [
    deal["files"],
    deal["attachments"],
    deal["deal_files"],
    deal["extra_files"],
    deal["documents"],
    readValueByPath(deal, "additional_data.files"),
    readValueByPath(deal, "attachments.items")
  ];

  attachmentSources.forEach((value) => {
    const parsed = parsePipedriveAttachments(
      value,
      "deal",
      { productId: null, dealProductId: null },
      `${dealId}`
    );
    parsed.forEach((attachment) => pushUniqueAttachment(attachments, attachment));
  });

  const trainingProducts = products.filter((product) => product.isTraining);
  const extraProducts = products.filter((product) => !product.isTraining);

  return {
    id: dealId,
    title: toStringWithFallback(deal["title"], `Presupuesto #${dealId}`),
    clientId: org.id ?? person.id ?? null,
    clientName: clientName ?? null,
    sede: sede ?? null,
    address: address ?? null,
    caes: caes ?? null,
    fundae: fundae ?? null,
    hotelPernocta: hotelPernocta ?? null,
    pipelineId: toOptionalNumber(deal["pipeline_id"]),
    pipelineName: pipelineName ?? null,
    wonDate,
    formations,
    trainingProducts,
    extraProducts,
    notes,
    attachments
  };
};

const app = new Hono().basePath("/.netlify/functions/api");
app.use("*", cors());

const sampleDeals: DealRecord[] = [];

// Health
app.get("/health", (c) => c.json({ ok: true, at: new Date().toISOString() }));

// Listado y detalle básico de deals (sin BD, datos de ejemplo)
app.get("/deals", async (c) => {
  const url = new URL(c.req.url);
  const dealIdParam = url.searchParams.get("dealId");

  if (dealIdParam) {
    const dealId = Number.parseInt(dealIdParam, 10);

    if (!Number.isFinite(dealId)) {
      return c.json({ deal: null, message: "El identificador de presupuesto no es válido." }, 400);
    }

    try {
      const rawDeal = await getDealById(dealId);

      if (!rawDeal) {
        return c.json(
          { deal: null, message: "No se encontró el presupuesto solicitado." },
          404
        );
      }

      if (typeof rawDeal !== "object" || rawDeal === null) {
        throw new Error("Respuesta inesperada de Pipedrive al obtener un presupuesto");
      }

      const deal = mapPipedriveDealToRecord(rawDeal as Record<string, unknown>);
      return c.json({ deal });
    } catch (error) {
      console.error(`Error al consultar el deal ${dealId} en Pipedrive`, error);
      return c.json(
        { deal: null, message: "No se pudo obtener el presupuesto desde Pipedrive." },
        502
      );
    }
  }

  return c.json({ deals: sampleDeals, page: 1, limit: sampleDeals.length });
});

// Handler manual (evita el adapter y problemas de path)
export const handler: Handler = async (event) => {
  const host = event.headers["x-forwarded-host"] || event.headers["host"] || "localhost";
  const scheme = event.headers["x-forwarded-proto"] || "http";
  const path = event.path || "/.netlify/functions/api";
  const query = event.rawQuery
    ? `?${event.rawQuery}`
    : event.queryStringParameters
    ? `?${new URLSearchParams(event.queryStringParameters as Record<string, string>).toString()}`
    : "";
  const url = `${scheme}://${host}${path}${query}`;

  const req = new Request(url, {
    method: event.httpMethod,
    headers: event.headers as any,
    body:
      event.body && !["GET", "HEAD"].includes(event.httpMethod)
        ? event.isBase64Encoded
          ? Buffer.from(event.body, "base64")
          : event.body
        : undefined
  });

  const res = await app.fetch(req);
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => (headers[k] = v));
  const body = await res.text();
  return { statusCode: res.status, headers, body };
};
