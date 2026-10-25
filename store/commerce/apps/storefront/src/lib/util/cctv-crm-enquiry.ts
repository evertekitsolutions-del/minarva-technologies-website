import type { CctvLeadRequest, VerifiedCctvQuoteProduct } from "./cctv-lead-request"
import { isValidDeliveryPin, normalizeAdSource, validQuoteProductReference } from "./cctv-lead-request"

/**
 * STORE-028: reuse Minarva Technologies' existing protected enquiry Edge API,
 * NOT direct public table writes, a second CRM, or a service-role browser key.
 * The function itself enforces consent, CAPTCHA-like timing, honeypot and
 * per-fingerprint / per-phone rate limiting, with its server-only key.
 */
const ENDPOINT =
  "https://kwullzwhlzziosjsejud.supabase.co/functions/v1/public-enquiry-submit"
const SERVICE = "CCTV & Security Systems"

export type CctvCrmContact = {
  name: string
  phone: string
  email?: string
  consentToContact: boolean
  formStartedAt: number
  companyWebsite?: string
}

function validateContact(contact: CctvCrmContact): void {
  const name = contact.name.trim()
  const phone = contact.phone.trim()
  const digits = phone.replace(/\D/g, "")
  const email = contact.email?.trim() ?? ""
  if (name.length < 2 || name.length > 120 ||
      phone.length < 7 || phone.length > 30 ||
      !/^[+0-9() .-]+$/.test(phone) ||
      digits.length < 7 || digits.length > 15 ||
      (email.length > 0 &&
       (email.length > 320 ||
        !/^[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email))) ||
      contact.consentToContact !== true ||
      !Number.isSafeInteger(contact.formStartedAt) ||
      contact.formStartedAt <= 0) {
    throw new TypeError("Invalid or non-consented customer enquiry")
  }
}

export function makeCctvCrmEnquiry(
  request: CctvLeadRequest,
  contact: CctvCrmContact,
  product?: VerifiedCctvQuoteProduct
) {
  validateContact(contact)
  if (!isValidDeliveryPin(request.deliveryPincode) ||
      !["home", "shop", "office", "warehouse", "other"].includes(request.premise) ||
      !["2", "4", "8", "16", "not_sure"].includes(request.cameraCount) ||
      !["required", "not_required", "need_advice"].includes(request.installation)) {
    throw new TypeError("Invalid package requirement")
  }
  const source = request.source ? normalizeAdSource(request.source) : "other"
  const message = [
    "CCTV package quotation request",
    ...(product && validQuoteProductReference(product) ? [
      "Selected package: " + product.title.trim().replace(/[\\r\\n]/g, " ").slice(0, 150),
      "Product ref: " + product.handle,
      ...(product.variantSku ? ["Variant SKU: " + product.variantSku] : []),
    ] : []),
    "Premises: " + request.premise,
    "Camera quantity: " + request.cameraCount,
    "Installation: " + request.installation,
    "Delivery PIN: " + request.deliveryPincode,
    ...(source !== "other" ? ["Campaign: " + source] : []),
    "Please confirm kit contents, INR price, availability, warranty,",
    "installation charge and final courier rate before taking payment.",
  ].join("\n")

  return {
    name: contact.name.trim(),
    phone: contact.phone.trim(),
    email: contact.email?.trim() || null,
    service: SERVICE,
    message,
    consent_to_contact: true,
    company_website: (contact.companyWebsite ?? "").slice(0, 200),
    form_started_at: contact.formStartedAt,
  }
}

export const crmEnquiryEnabled = () =>
  process.env.NEXT_PUBLIC_STORE_CRM_ENQUIRY_ENABLED === "true" &&
  process.env.NEXT_PUBLIC_STORE_CRM_ENQUIRY_APPROVED === "true" &&
  (process.env.NEXT_PUBLIC_STORE_CRM_PUBLISHABLE_KEY ?? "").startsWith(
    "sb_publishable_"
  )

export async function submitConsentedCctvCrmEnquiry({
  request, contact, product, fetchImpl = fetch,
}: {
  request: CctvLeadRequest
  contact: CctvCrmContact
  product?: VerifiedCctvQuoteProduct
  fetchImpl?: typeof fetch
}): Promise<{ saved: true }> {
  if (!crmEnquiryEnabled()) {
    throw new Error("CRM enquiry integration not approved")
  }
  const payload = makeCctvCrmEnquiry(request, contact, product)
  const key = process.env.NEXT_PUBLIC_STORE_CRM_PUBLISHABLE_KEY as string
  const response = await fetchImpl(ENDPOINT, {
    method: "POST",
    mode: "cors",
    credentials: "omit",
    cache: "no-store",
    headers: {
      apikey: key,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  })
  if (response.status === 429) {
    throw new Error("Too many enquiries. Please use WhatsApp or try later.")
  }
  if (!response.ok) {
    throw new Error("CRM is unavailable; please contact Minarva on WhatsApp.")
  }
  const result: unknown = await response.json()
  if (!result || typeof result !== "object" ||
      !("accepted" in result) || result.accepted !== true) {
    throw new Error("CRM did not confirm the enquiry; please use WhatsApp.")
  }
  return Object.freeze({ saved: true })
}
