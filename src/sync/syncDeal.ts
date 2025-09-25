import { pipedriveClient } from './pipedriveClient';
import type { Deal, Organization, Person } from './pipedriveClient';
import {
  ensureSessionsForDeal,
  getOrCreateOrganization,
  getOrCreatePerson,
  syncDealDocuments,
  syncDealNotes,
  upsertDeal
} from './upserts';

export async function syncDeal(dealPipedriveId: number): Promise<{ dealId: number }> {
  const deal = await pipedriveClient.getDeal(dealPipedriveId);

  const organization = await fetchOrganization(deal);
  const person = await fetchPerson(deal);

  const organizationId = organization ? await getOrCreateOrganization(organization) : null;
  const personId = person ? await getOrCreatePerson(person, organizationId) : null;

  const dealId = await upsertDeal(deal, organizationId, personId);

  await syncDealNotes(deal.id, dealId);
  await syncDealDocuments(deal.id, dealId);
  await ensureSessionsForDeal(dealId, deal.id);

  return { dealId };
}

async function fetchOrganization(deal: Deal): Promise<Organization | null> {
  if (!deal.org_id) {
    return null;
  }

  return pipedriveClient.getOrganization(deal.org_id);
}

async function fetchPerson(deal: Deal): Promise<Person | null> {
  if (!deal.person_id) {
    return null;
  }

  return pipedriveClient.getPerson(deal.person_id);
}
