/**
 * STORE-017: read-only official Shiprocket courier serviceability adapter.
 * NO orders, AWBs, pickup, wallet charges or COD collection are created.
 *
 * A serviceability result's "cod: 1" means general COD is possible;
 * it is NOT proof that this merchant can collect only merchandise residual
 * after the buyer separately prepays delivery fees.
 *
 * All displayed rates remain NOT AUTHORITATIVE until a merchant-approved
 * all-inclusive amount (GST, fuel, insurance, surcharges, handling) exists.
 */
import { chargeableWeightGrams } from "./checkout-pricing.mjs"

const SHIPROCKET_ORIGIN = "https://apiv2.shiprocket.in"
const SERVICEABILITY_PATH = "/v1/external/courier/serviceability/"

function pin(value, description) {
  if (typeof value !== "string" || !/^[1-9]\d{5}$/.test(value)) {
    throw new TypeError(`Invalid ${description} PIN code`)
  }
  return value
}
function validValue(value, description) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 100_000_000_00) {
    throw new RangeError(`Invalid ${description} value in paise`)
  }
  return value
}

export function buildShiprocketServiceabilityQuery({
  pickupPincode, deliveryPincode, actualWeightGrams,
  lengthCm, breadthCm, heightCm,
  declaredValuePaise, method = "prepaid",
}) {
  const from = pin(pickupPincode, "pickup")
  const to = pin(deliveryPincode, "delivery")
  if (!["prepaid", "partial_cod"].includes(method)) {
    throw new TypeError("Unsupported courier payment method")
  }
  // Shiprocket's published endpoint expects weight in kg and can consider
  // dimensions. We use the existing volumetric/slab calculation instead
  // of under-declaring the parcel to obtain a misleading rate.
  const weight = chargeableWeightGrams({
    actualWeightGrams, lengthCm, breadthCm, heightCm,
  })
  const valuePaise = validValue(declaredValuePaise, "declared merchandise")
  const amount = Number((valuePaise / 100).toFixed(2))
  const url = new URL(SERVICEABILITY_PATH, SHIPROCKET_ORIGIN)
  const params = url.searchParams
  params.set("pickup_postcode",from)
  params.set("delivery_postcode",to)
  params.set("cod", method === "partial_cod" ? "1" : "0")
  params.set("weight",(weight.chargeableGrams / 1000).toFixed(3))
  params.set("length",String(lengthCm))
  params.set("breadth",String(breadthCm))
  params.set("height",String(heightCm))
  params.set("declared_value",amount.toFixed(2))
  return Object.freeze({
    url: url.toString(),
    chargedWeightGrams: weight.chargeableGrams,
    pickupPincode:from,
    deliveryPincode:to,
    method,
  })
}

/** Do not compute a fake all-in shipping price from partial fee fields. */
export function normalizeShiprocketServiceabilityResponse(raw, request) {
  if (!request || !/^[1-9]\d{5}$/.test(request.deliveryPincode)) {
    throw new TypeError("Server validated courier request required")
  }
  const available = raw?.data?.available_courier_companies
  if (!Array.isArray(available)) {
    throw new Error("Courier API did not return a serviceability list")
  }
  const candidates = available
    .filter(c => c && Number.isSafeInteger(c.courier_company_id) &&
      c.courier_company_id > 0 && typeof c.courier_name === "string")
    .map(c => {
      const codAvailable = c.cod === 1 || c.cod === true || c.cod === "1"
      const estimates = Number(c.estimated_delivery_days)
      const estimatedDays = Number.isSafeInteger(estimates) && estimates >= 0
        ? estimates : null
      const finiteCharge = value =>
        typeof value === "number" && Number.isFinite(value) && value >= 0
          ? value
          : null
      return Object.freeze({
        courierCompanyId: c.courier_company_id,
        courierName: c.courier_name,
        destinationPincode:request.deliveryPincode,
        codAvailable,
        estimatedDays,
        chargeWeightGrams:request.chargedWeightGrams,
        // Component amounts from provider are INFORMATIONAL, not final.
        componentsRupees: Object.freeze({
          freight:finiteCharge(c.freight_charge),
          cod:finiteCharge(c.cod_charges),
          other:finiteCharge(c.other_charges),
          coverage:finiteCharge(c.coverage_charges),
        }),
        totalChargePaise:null,
        rateVerifiedAllInclusive:false,
        // An ordinary COD serviceability response cannot certify that
        // the carrier will collect a merchant-specific residual amount.
        partialCodSupported:false,
        bookingAllowed:false,
      })
    })
  return Object.freeze(candidates)
}

/**
 * Has NO user-facing route. Only a server-side operator with a non-public
 * bearer token may explicitly enable this sandbox GET. Even a GET request
 * can leak credentials if logged, so the URL never contains the token.
 */
export async function fetchShiprocketServiceability({
  bearerToken,fetchImpl=fetch,request,
}) {
  if (process.env.NODE_ENV === "production" ||
      process.env.STORE_SHIPROCKET_READONLY_ENABLED !== "true" ||
      process.env.STORE_SHIPROCKET_READONLY_APPROVED !== "true") {
    throw new Error("Shiprocket serviceability access disabled")
  }
  if (typeof bearerToken !== "string" || bearerToken.length < 16 ||
      !/^[A-Za-z0-9._-]+$/.test(bearerToken)) {
    throw new Error("No valid backend Shiprocket bearer token")
  }
  if (!request?.url?.startsWith(SHIPROCKET_ORIGIN + SERVICEABILITY_PATH) ||
      !request?.deliveryPincode) {
    throw new Error("Only the official Shiprocket serviceability endpoint is supported")
  }
  if (typeof fetchImpl !== "function") throw new TypeError("HTTP transport required")
  const result = await fetchImpl(request.url,{
    method:"GET",
    headers:{
      Authorization:`Bearer ${bearerToken}`,
      Accept:"application/json",
    },
    redirect:"error",
  })
  if (!result?.ok) throw new Error("Shiprocket serviceability API failed")
  return normalizeShiprocketServiceabilityResponse(await result.json(),request)
}
