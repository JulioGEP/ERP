#!/usr/bin/env node
import { closePool } from './upserts';
import { syncDeal } from './syncDeal';

function parseArgs(argv: string[]): { dealId: number } {
  const idIndex = argv.findIndex((arg) => arg === '--id');
  if (idIndex === -1 || idIndex === argv.length - 1) {
    throw new Error('Usage: pnpm sync:deal --id <PipedriveDealId>');
  }

  const value = Number(argv[idIndex + 1]);
  if (Number.isNaN(value) || value <= 0) {
    throw new Error('The --id flag must be followed by a positive numeric value');
  }

  return { dealId: value };
}

async function main() {
  try {
    const { dealId } = parseArgs(process.argv.slice(2));
    const result = await syncDeal(dealId);
    console.log(`Deal ${dealId} synchronized successfully (local id ${result.dealId})`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

void main();
