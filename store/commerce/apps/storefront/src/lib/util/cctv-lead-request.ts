/**
 * Public ad-to-enquiry handoff. No server write, cookie, message dispatch,
 * payment order, pricing assertion or unauthorized data collection.
 * The customer reviews and sends the WhatsApp draft themselves.
 */
export type CctvPremise = "home" | "shop" | "office" | "warehouse" | "other"
export type CctvCameraCount = "2" | "4" | "8" | "16" | "not_sure"
export type CctvInstallation = "required" | "not_required" | "need_advice"
export type CctvAdSource = "instagram" | "facebook" | "google" | "whatsapp" | "direct" | "other"

export type CctvLeadRequest = {
  premise: CctvPremise
  cameraCount: CctvCameraCount
  installation: CctvInstallation
  deliveryPincode: string
  source?: CctvAdSource
}

const PREMISES: Record<CctvPremise, string> = {
  home: "Home / വീട്",
  shop: "Shop / കട",
  office: "Office / ഓഫീസ്",
  warehouse: "Warehouse / ഗോഡൗൺ",
  other: "Other / മറ്റുള്ളവ",
}
const INSTALLATION: Record<CctvInstallation, string> = {
  required: "Required / വേണം",
  not_required: "Not required / വേണ്ട",
  need_advice: "Please advise / നിർദേശം വേണം",
}

export const isValidDeliveryPin = (value: string) =>
  /^[1-9][0-9]{5}$/.test(value)

export const normalizeAdSource = (source: string | undefined | null): CctvAdSource => {
  const normalized = source?.toLowerCase().trim()
  return normalized === "instagram" || normalized === "facebook" ||
    normalized === "google" || normalized === "whatsapp" ||
    normalized === "direct" ? normalized : "other"
}

export function buildCctvLeadWhatsAppUrl(input: CctvLeadRequest): string {
  if (!Object.hasOwn(PREMISES, input.premise) ||
      !["2", "4", "8", "16", "not_sure"].includes(input.cameraCount) ||
      !Object.hasOwn(INSTALLATION, input.installation) ||
      !isValidDeliveryPin(input.deliveryPincode)) {
    throw new TypeError("Incomplete or invalid CCTV enquiry")
  }

  const count = input.cameraCount === "not_sure"
    ? "Please recommend / നിർദേശം വേണം" : input.cameraCount
  const message = [
    "Hello Minarva Technologies,",
    "I saw your CCTV packages and would like an accurate quotation.",
    "Premises: " + PREMISES[input.premise],
    "Cameras: " + count,
    "Installation: " + INSTALLATION[input.installation],
    "Delivery PIN: " + input.deliveryPincode,
    ...(input.source && input.source !== "other"
      ? ["Enquiry channel: " + normalizeAdSource(input.source)] : []),
    "Please confirm the actual brand/model, complete kit contents,",
    "verified INR price, stock, warranties, installation charges",
    "and final courier delivery cost for my PIN.",
    "I understand online payment and courier booking are not yet active.",
    "Please share a confirmed quotation before I make any payment.",
  ].join("\n")

  return "https://wa.me/916235353732?text=" + encodeURIComponent(message)
}
