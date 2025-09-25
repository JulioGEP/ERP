import { Pool } from 'pg';

import { pipedriveClient } from './pipedriveClient';
import type { Deal, Note, Organization, Person, File } from './pipedriveClient';
import {
  buildExtrasSummary,
  buildTrainingSummary,
  calculateSessionsNeeded,
  classifyDealProducts,
  extractDealPayload,
  extractOrganizationPayload,
  extractPersonPayload
} from './mappings';

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.NEON_DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL (or POSTGRES_URL/NEON_DATABASE_URL) environment variable is required');
}

const shouldUseSSL =
  (process.env.DATABASE_SSL ?? '').toLowerCase() === 'true' || DATABASE_URL.includes('neon.tech');

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: shouldUseSSL ? { rejectUnauthorized: false } : undefined
});

export async function getOrCreateOrganization(organization: Organization): Promise<number> {
  const payload = extractOrganizationPayload(organization);

  const result = await pool.query<{ id: number }>(
    `INSERT INTO organizations (pipedrive_id, name, cif, phone, address, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT (pipedrive_id) DO UPDATE
     SET name = EXCLUDED.name,
         cif = EXCLUDED.cif,
         phone = EXCLUDED.phone,
         address = EXCLUDED.address,
         updated_at = NOW()
     RETURNING id`,
    [payload.pipedriveId, payload.name, payload.cif, payload.phone, payload.address]
  );

  return result.rows[0].id;
}

export async function getOrCreatePerson(person: Person, orgId: number | null): Promise<number> {
  const payload = extractPersonPayload(person, orgId);

  const result = await pool.query<{ id: number }>(
    `INSERT INTO persons (pipedrive_id, org_id, first_name, last_name, email, phone, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
     ON CONFLICT (pipedrive_id) DO UPDATE
     SET org_id = EXCLUDED.org_id,
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         email = EXCLUDED.email,
         phone = EXCLUDED.phone,
         updated_at = NOW()
     RETURNING id`,
    [payload.pipedriveId, payload.orgId, payload.firstName, payload.lastName, payload.email, payload.phone]
  );

  return result.rows[0].id;
}

export async function upsertDeal(deal: Deal, orgId: number | null, personId: number | null): Promise<number> {
  const payload = extractDealPayload(deal);
  const products = await pipedriveClient.getDealProducts(deal.id);
  const classification = classifyDealProducts(products);

  const trainingSummary = classification.trainingNames.length
    ? buildTrainingSummary(classification)
    : null;
  const extrasSummary = classification.extraNames.length ? buildExtrasSummary(classification) : null;

  const result = await pool.query<{ id: number }>(
    `INSERT INTO deals (
        pipedrive_id,
        org_id,
        person_id,
        pipeline_id,
        training,
        prod_extra,
        hours,
        deal_direction,
        site,
        caes,
        fundae,
        hotel_night,
        status,
        created_at,
        updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
     ON CONFLICT (pipedrive_id) DO UPDATE SET
        org_id = EXCLUDED.org_id,
        person_id = EXCLUDED.person_id,
        pipeline_id = EXCLUDED.pipeline_id,
        training = EXCLUDED.training,
        prod_extra = EXCLUDED.prod_extra,
        hours = EXCLUDED.hours,
        deal_direction = EXCLUDED.deal_direction,
        site = EXCLUDED.site,
        caes = EXCLUDED.caes,
        fundae = EXCLUDED.fundae,
        hotel_night = EXCLUDED.hotel_night,
        status = EXCLUDED.status,
        updated_at = NOW()
     RETURNING id`,
    [
      payload.pipedriveId,
      orgId,
      personId,
      payload.pipelineId,
      trainingSummary,
      extrasSummary,
      payload.hours,
      payload.direction,
      payload.site,
      payload.caes,
      payload.fundae,
      payload.hotelNight,
      payload.status
    ]
  );

  return result.rows[0].id;
}

export async function syncDealNotes(dealPipedriveId: number, localDealId: number): Promise<void> {
  const notes = await pipedriveClient.getDealNotes(dealPipedriveId);

  await Promise.all(
    notes.map(async (note: Note) => {
      const comment =
        typeof note.content === 'string'
          ? note.content
          : note.content != null
            ? String(note.content)
            : '';
      const createdAt = note.add_time ? new Date(note.add_time) : new Date();
      const updatedAt = note.update_time ? new Date(note.update_time) : createdAt;

      await pool.query(
        `INSERT INTO notes (pipedrive_id, deal_id, comment, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (pipedrive_id) DO UPDATE
         SET deal_id = EXCLUDED.deal_id,
             comment = EXCLUDED.comment,
             updated_at = EXCLUDED.updated_at`,
        [note.id, localDealId, comment, createdAt, updatedAt]
      );
    })
  );
}

export async function syncDealDocuments(dealPipedriveId: number, localDealId: number): Promise<void> {
  const files = await pipedriveClient.getDealFiles(dealPipedriveId);

  await Promise.all(
    files.map(async (file: File) => {
      const name = typeof file.name === 'string' ? file.name : file.name != null ? String(file.name) : null;
      const downloadUrl =
        typeof file.file_url === 'string'
          ? file.file_url
          : typeof file.url === 'string'
            ? file.url
            : file.file_url != null
              ? String(file.file_url)
              : file.url != null
                ? String(file.url)
                : null;
      const createdAt = file.add_time ? new Date(file.add_time) : new Date();
      const updatedAt = file.update_time ? new Date(file.update_time) : createdAt;

      await pool.query(
        `INSERT INTO documents (pipedrive_id, deal_id, name, download_url, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (pipedrive_id) DO UPDATE
         SET deal_id = EXCLUDED.deal_id,
             name = EXCLUDED.name,
             download_url = EXCLUDED.download_url,
             updated_at = EXCLUDED.updated_at`,
        [file.id, localDealId, name, downloadUrl, createdAt, updatedAt]
      );
    })
  );
}

export async function ensureSessionsForDeal(localDealId: number, dealPipedriveId: number): Promise<void> {
  const products = await pipedriveClient.getDealProducts(dealPipedriveId);
  const sessionsNeeded = calculateSessionsNeeded(products);

  if (sessionsNeeded <= 0) {
    return;
  }

  const existingResult = await pool.query<{ count: string }>('SELECT COUNT(*) FROM sessions WHERE deal_id = $1', [localDealId]);
  const existingCount = Number(existingResult.rows[0]?.count ?? 0);
  const toCreate = sessionsNeeded - existingCount;

  if (toCreate <= 0) {
    return;
  }

  const dealDefaultsResult = await pool.query<{ site: string | null; deal_direction: string | null }>(
    'SELECT site, deal_direction FROM deals WHERE id = $1',
    [localDealId]
  );
  const defaults = dealDefaultsResult.rows[0] ?? { site: null, deal_direction: null };

  for (let i = 0; i < toCreate; i += 1) {
    await pool.query(
      `INSERT INTO sessions (deal_id, status, start_at, end_at, site, address, comment, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [localDealId, 'pending', null, null, defaults.site, defaults.deal_direction, '']
    );
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
