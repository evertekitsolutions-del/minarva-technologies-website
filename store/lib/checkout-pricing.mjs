/**
 * Minarva Store quote rules (currency: integer paise; mass: integer grams).
 * Pure functions only. No provider API calls or client-side payment authority.
 * Provider prices must be normalized to all-in paise on the trusted server.
 */
const MAX_PAISA = 100_000_000_00;

function integer(value, label, min = 0, max = MAX_PAISA) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function addPaise(...values) {
  return integer(values.reduce((sum, n) => sum + integer(n, 'amount'), 0), 'total');
}

/** Applied weight is max(dead weight, volumetric weight), then carrier slab. */
export function chargeableWeightGrams({
  actualWeightGrams, lengthCm, breadthCm, heightCm,
  volumetricDivisor = 5000, slabGrams = 500,
}) {
  integer(actualWeightGrams, 'actualWeightGrams', 1, 100_000_000);
  for (const [key, value] of Object.entries({ lengthCm, breadthCm, heightCm })) {
    integer(value, key, 1, 10000);
  }
  integer(volumetricDivisor, 'volumetricDivisor', 1, 100000);
  integer(slabGrams, 'slabGrams', 1, 100000);
  const volume = lengthCm * breadthCm * heightCm;
  if (!Number.isSafeInteger(volume)) throw new RangeError('Box volume overflow');
  const volumetricWeightGrams = Math.ceil(volume * 1000 / volumetricDivisor);
  const appliedWeightGrams = Math.max(actualWeightGrams, volumetricWeightGrams);
  const chargeableGrams = Math.ceil(appliedWeightGrams / slabGrams) * slabGrams;
  if (!Number.isSafeInteger(chargeableGrams)) throw new RangeError('Weight overflow');
  return Object.freeze({ actualWeightGrams, volumetricWeightGrams, appliedWeightGrams, chargeableGrams });
}

/**
 * For partial COD collect shipping + handling first through verified gateway.
 * Courier must then collect onDeliveryPaise ONLY; actual support is a separate
 * carrier/account integration gate. This function never authorizes shipment.
 */
export function checkoutSplit({ merchandisePaise, shippingPaise, codHandlingPaise = 0, method }) {
  integer(merchandisePaise, 'merchandisePaise', 1);
  integer(shippingPaise, 'shippingPaise');
  integer(codHandlingPaise, 'codHandlingPaise');
  if (method !== 'prepaid' && method !== 'partial_cod') {
    throw new TypeError('Unsupported payment method');
  }
  const totalPaise = addPaise(merchandisePaise, shippingPaise, codHandlingPaise);
  const payableNowPaise = method === 'prepaid'
    ? totalPaise
    : addPaise(shippingPaise, codHandlingPaise);
  if (method === 'partial_cod' && payableNowPaise === 0) {
    throw new RangeError('Partial COD requires a positive verified advance');
  }
  return Object.freeze({
    method, merchandisePaise, shippingPaise, codHandlingPaise, totalPaise,
    payableNowPaise, onDeliveryPaise: method === 'partial_cod' ? merchandisePaise : 0,
  });
}

/**
 * Accept only server-side courier quotes normalized to all-in paise.
 * Never treat a quote object from the browser as authoritative.
 */
export function chooseCourier(rates, { method, destinationPincode, now = Date.now() }) {
  if (!Array.isArray(rates)) throw new TypeError('rates must be an array');
  if (!/^[1-9][0-9]{5}$/.test(destinationPincode)) {
    throw new TypeError('Invalid destination PIN');
  }
  if (method !== 'prepaid' && method !== 'partial_cod') {
    throw new TypeError('Invalid method');
  }
  if (!Number.isFinite(now)) throw new TypeError('Invalid timestamp');
  const viable = rates.filter((r) => {
    if (r == null || typeof r !== 'object') return false;
    if (r.destinationPincode !== destinationPincode || r.serviceable !== true) return false;
    if (method === 'partial_cod' && r.partialCodSupported !== true) return false;
    if (typeof r.providerCourierId !== 'string' || r.providerCourierId.length === 0) return false;
    if (!Number.isSafeInteger(r.totalChargePaise) || r.totalChargePaise < 0) return false;
    if (typeof r.expiresAt !== 'string') return false;
    const expires = Date.parse(r.expiresAt);
    if (!Number.isFinite(expires) || expires <= now) return false;
    return r.estimatedDays == null || (Number.isInteger(r.estimatedDays) && r.estimatedDays >= 0);
  }).sort((a, b) => a.totalChargePaise - b.totalChargePaise
    || (a.estimatedDays ?? Infinity) - (b.estimatedDays ?? Infinity));
  return viable.length ? Object.freeze({ ...viable[0] }) : null;
}

/**
 * Intended to be called only for a DB-locked authoritative quote. Verify
 * payment webhooks separately before booking courier or collecting COD.
 */
export function validateQuoteForCheckout(quote, { method, destinationPincode, now = Date.now() }) {
  if (!quote || quote.serviceable !== true || quote.destinationPincode !== destinationPincode) {
    throw new Error('No matching serviceable courier quote');
  }
  const choice = chooseCourier([quote], { method, destinationPincode, now });
  if (choice === null) throw new Error('Expired or unsupported courier quote');
  return choice;
}
