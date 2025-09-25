import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateSessionsNeeded, parseBoolean } from '../mappings.js';
import type { DealProduct } from '../pipedriveClient';

const mockProduct = (code: string, quantity: number): DealProduct => ({
  id: Math.floor(Math.random() * 100000),
  quantity,
  product: {
    code,
    name: code
  }
});

test('calculateSessionsNeeded sums quantities of training products only', () => {
  const products = [
    mockProduct('form-online', 2),
    mockProduct('FORM-presencial', 1),
    mockProduct('extra-material', 5),
    mockProduct('form-avanzado', 3)
  ];

  assert.equal(calculateSessionsNeeded(products), 6);
});

test('parseBoolean accepts common truthy variations', () => {
  assert.equal(parseBoolean(true), true);
  assert.equal(parseBoolean('1'), true);
  assert.equal(parseBoolean('true'), true);
  assert.equal(parseBoolean('YES'), true);
  assert.equal(parseBoolean(1), true);
});

test('parseBoolean accepts common falsy variations', () => {
  assert.equal(parseBoolean(false), false);
  assert.equal(parseBoolean('0'), false);
  assert.equal(parseBoolean('false'), false);
  assert.equal(parseBoolean(0), false);
  assert.equal(parseBoolean(null), false);
});
