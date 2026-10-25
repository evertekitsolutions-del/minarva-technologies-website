/**
 * STORE-029. Read-only preflight of the EXISTING Minarva CRM Edge Function.
 *
 * Does NOT submit enquiries, write CRM rows, send WhatsApp, request payment,
 * grant browser privileges, or change Supabase production settings.
 */
export const MINARVA_CRM_EDGE_URL =
  "https://kwullzwhlzziosjsejud.supabase.co/functions/v1/public-enquiry-submit"

export const CRM_ALLOWED_ORIGIN_PROBES = Object.freeze([
  "https://minarvatechnologies.com",
  "https://www.minarvatechnologies.com",
  "https://store.minarvatechnologies.com",
])
export const CRM_REJECTED_ORIGIN_PROBE = "https://untrusted.example.invalid"

const allowedMethods = (header) =>
  (header ?? "").split(",").map((s) => s.trim().toUpperCase())
const allowedHeaders = (header) =>
  (header ?? "").split(",").map((s) => s.trim().toLowerCase())

/** Requests are deliberately OPTIONS-only: no PII, inserts, or quota changes. */
export async function inspectCrmOrigin({
  origin,
  expectAllowed = true,
  fetchImpl = fetch,
} = {}) {
  if (!CRM_ALLOWED_ORIGIN_PROBES.includes(origin) &&
      origin !== CRM_REJECTED_ORIGIN_PROBE) {
    throw new TypeError("Unsupported CRM origin probe")
  }
  if (typeof fetchImpl !== "function") {
    throw new TypeError("HTTP probe function is required")
  }
  const response = await fetchImpl(MINARVA_CRM_EDGE_URL, {
    method: "OPTIONS",
    redirect: "error",
    cache: "no-store",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "apikey,content-type",
    },
    signal: AbortSignal.timeout(8000),
  })
  const acceptedOrigin = response?.headers?.get("access-control-allow-origin") ?? null
  const allowed = expectAllowed
    ? response?.status === 204 &&
      acceptedOrigin === origin &&
      allowedMethods(response.headers.get("access-control-allow-methods")).includes("POST") &&
      ["apikey", "content-type"].every((name) =>
        allowedHeaders(response.headers.get("access-control-allow-headers")).includes(name))
    : response?.status === 403 && acceptedOrigin === null

  return Object.freeze({
    origin,
    expected: expectAllowed ? "allowed" : "blocked",
    status: Number(response?.status) || 0,
    verified: Boolean(allowed),
    // Never expose a key, token, or full response body in logs.
  })
}

export async function verifyCrmOriginReadiness({ fetchImpl = fetch } = {}) {
  const checks = []
  for (const origin of CRM_ALLOWED_ORIGIN_PROBES) {
    checks.push(await inspectCrmOrigin({ origin, fetchImpl }))
  }
  checks.push(await inspectCrmOrigin({
    origin: CRM_REJECTED_ORIGIN_PROBE,
    expectAllowed: false,
    fetchImpl,
  }))
  return Object.freeze({
    ready: checks.every((check) => check.verified),
    checks: Object.freeze(checks),
    operation: "readonly_options_only",
    crmWrites: false,
    merchantActivation: false,
  })
}
