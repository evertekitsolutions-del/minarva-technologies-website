import test from 'node:test';
import assert from 'node:assert/strict';
import { chargeableWeightGrams, checkoutSplit, chooseCourier, validateQuoteForCheckout } from '../lib/checkout-pricing.mjs';

const NOW = Date.parse('2026-10-24T12:00:00Z');
const PIN = '695020';
const RATE = {
  providerCourierId: 'courier-42', destinationPincode: PIN, serviceable: true,
  partialCodSupported: true, totalChargePaise: 18500, estimatedDays: 3,
  expiresAt: '2026-10-24T12:05:00Z',
};

test('applies volumetric weight, not just dead weight', () => {
  assert.deepEqual(chargeableWeightGrams({ actualWeightGrams: 1200, lengthCm: 40, breadthCm: 30, heightCm: 20 }), {
    actualWeightGrams: 1200, volumetricWeightGrams: 4800, appliedWeightGrams: 4800, chargeableGrams: 5000,
  });
});

test('carrier divisor and slab are configurable', () => {
  const result = chargeableWeightGrams({ actualWeightGrams: 1500, lengthCm: 30, breadthCm: 20, heightCm: 10, volumetricDivisor: 6000, slabGrams: 1000 });
  assert.equal(result.chargeableGrams, 2000);
});

test('rejects malformed and negative shipping input', () => {
  assert.throws(() => chargeableWeightGrams({ actualWeightGrams: -1, lengthCm: 10, breadthCm: 10, heightCm: 10 }), /actualWeightGrams/);
  assert.throws(() => chargeableWeightGrams({ actualWeightGrams: 1000, lengthCm: 12.5, breadthCm: 10, heightCm: 10 }), /lengthCm/);
});

test('prepaid pays complete disclosed amount now', () => {
  assert.deepEqual(checkoutSplit({ merchandisePaise: 1290000, shippingPaise: 18500, method: 'prepaid' }), {
    method: 'prepaid', merchandisePaise: 1290000, shippingPaise: 18500, codHandlingPaise: 0,
    totalPaise: 1308500, payableNowPaise: 1308500, onDeliveryPaise: 0,
  });
});

test('partial COD advance is shipping and handling only; residual is product amount', () => {
  const split = checkoutSplit({ merchandisePaise: 1290000, shippingPaise: 18500, codHandlingPaise: 2500, method: 'partial_cod' });
  assert.equal(split.payableNowPaise, 21000);
  assert.equal(split.onDeliveryPaise, 1290000);
  assert.equal(split.totalPaise, split.payableNowPaise + split.onDeliveryPaise);
});

test('partial COD rejects zero advance, invalid mode, fractional paise', () => {
  assert.throws(() => checkoutSplit({ merchandisePaise: 10000, shippingPaise: 0, method: 'partial_cod' }), /positive/);
  assert.throws(() => checkoutSplit({ merchandisePaise: 10000, shippingPaise: 500, method: 'cod' }), /Unsupported/);
  assert.throws(() => checkoutSplit({ merchandisePaise: 10000, shippingPaise: 10.5, method: 'prepaid' }), /integer/);
});

test('selects cheapest compatible unexpired quote, breaks ties on ETA', () => {
  const selected = chooseCourier([
    { ...RATE, providerCourierId: 'slow', estimatedDays: 5 },
    { ...RATE, providerCourierId: 'fast', estimatedDays: 2 },
    { ...RATE, providerCourierId: 'expired', totalChargePaise: 1000, expiresAt: '2026-10-24T11:00:00Z' },
  ], { destinationPincode: PIN, method: 'partial_cod', now: NOW });
  assert.equal(selected.providerCourierId, 'fast');
});

test('prevents partial COD if courier has no explicit residual COD support', () => {
  assert.equal(chooseCourier([{ ...RATE, partialCodSupported: false }], { destinationPincode: PIN, method: 'partial_cod', now: NOW }), null);
});

test('rejects unsupported, expired or different destination pincode', () => {
  assert.equal(chooseCourier([{ ...RATE, serviceable: false }], { destinationPincode: PIN, method: 'prepaid', now: NOW }), null);
  assert.equal(chooseCourier([RATE], { destinationPincode: '682001', method: 'prepaid', now: NOW }), null);
  assert.throws(() => validateQuoteForCheckout(RATE, { method: 'prepaid', destinationPincode: PIN, now: NOW + 600000 }), /Expired/);
});

test('accepts an authorized matching live quote as input only, not as proof of payment', () => {
  const q = validateQuoteForCheckout(RATE, { destinationPincode: PIN, method: 'partial_cod', now: NOW });
  assert.equal(q.totalChargePaise, 18500);
  assert(Object.isFrozen(q));
});
