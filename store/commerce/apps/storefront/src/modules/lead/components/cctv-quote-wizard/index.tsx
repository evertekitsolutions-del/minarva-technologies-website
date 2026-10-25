"use client"

import { useMemo, useState } from "react"
import {
  buildCctvLeadWhatsAppUrl,
  isValidDeliveryPin,
  type CctvCameraCount,
  type CctvInstallation,
  type CctvPremise,
  type CctvAdSource,
} from "@lib/util/cctv-lead-request"

export default function CctvQuoteWizard({ source }: { source: CctvAdSource }) {
  const [premise, setPremise] = useState<CctvPremise>("home")
  const [cameraCount, setCameraCount] = useState<CctvCameraCount>("4")
  const [installation, setInstallation] = useState<CctvInstallation>("need_advice")
  const [pin, setPin] = useState("")

  const pinReady = isValidDeliveryPin(pin)
  const url = useMemo(() => {
    if (!pinReady) return null
    try {
      return buildCctvLeadWhatsAppUrl({
        premise, cameraCount, installation, deliveryPincode: pin, source,
      })
    } catch {
      return null
    }
  }, [premise, cameraCount, installation, pin, pinReady, source])

  return (
    <section
      className="mx-auto max-w-2xl rounded-xl border border-ui-border-base bg-ui-bg-base p-5 shadow-sm small:p-8"
      aria-label="CCTV package quotation request"
    >
      <h2 className="text-xl font-semibold">Find the right CCTV package</h2>
      <p lang="ml" className="mt-2 text-sm leading-relaxed text-ui-fg-subtle">
        നിങ്ങളുടെ ആവശ്യത്തിന് അനുയോജ്യമായ പാക്കേജിന്റെ യഥാർത്ഥ വിലയും
        ഡെലിവറി വിവരങ്ങളും ലഭിക്കാൻ താഴെ പൂരിപ്പിക്കുക.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-5 small:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm font-medium">
          Site type / സ്ഥാപനം
          <select
            value={premise}
            onChange={(event) => setPremise(event.target.value as CctvPremise)}
            className="rounded-md border border-ui-border-base bg-white p-3 text-gray-900"
          >
            <option value="home">Home / വീട്</option>
            <option value="shop">Shop / കട</option>
            <option value="office">Office / ഓഫീസ്</option>
            <option value="warehouse">Warehouse / ഗോഡൗൺ</option>
            <option value="other">Other / മറ്റുള്ളവ</option>
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium">
          Cameras / ക്യാമറകൾ
          <select
            value={cameraCount}
            onChange={(event) => setCameraCount(event.target.value as CctvCameraCount)}
            className="rounded-md border border-ui-border-base bg-white p-3 text-gray-900"
          >
            <option value="2">2 cameras</option>
            <option value="4">4 cameras</option>
            <option value="8">8 cameras</option>
            <option value="16">16 cameras</option>
            <option value="not_sure">Please recommend / നിർദേശം വേണം</option>
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium">
          Installation / ഇൻസ്റ്റലേഷൻ
          <select
            value={installation}
            onChange={(event) => setInstallation(event.target.value as CctvInstallation)}
            className="rounded-md border border-ui-border-base bg-white p-3 text-gray-900"
          >
            <option value="need_advice">Please advise / നിർദേശം വേണം</option>
            <option value="required">Required / വേണം</option>
            <option value="not_required">Not required / വേണ്ട</option>
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium">
          Kerala delivery PIN / പിൻകോഡ്
          <input
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            pattern="[1-9][0-9]{5}"
            autoComplete="postal-code"
            maxLength={6}
            placeholder="e.g. 695001"
            className="rounded-md border border-ui-border-base bg-white p-3 text-gray-900"
            aria-invalid={pin.length === 6 && !pinReady}
          />
        </label>
      </div>
      <p className="mt-3 text-xs text-ui-fg-subtle" role="status" aria-live="polite">
        {pinReady
          ? "PIN format accepted. Courier availability and final charges need confirmation."
          : "Enter a valid 6-digit delivery PIN to prepare your enquiry."}
      </p>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 block rounded-lg bg-gray-900 px-5 py-3 text-center text-sm font-semibold text-white"
        >
          Request quotation on WhatsApp / WhatsApp-ൽ വില ചോദിക്കൂ
        </a>
      ) : (
        <button type="button" disabled
          className="mt-6 w-full rounded-lg bg-gray-400 px-5 py-3 text-sm font-semibold text-white opacity-70">
          Enter PIN to request quotation
        </button>
      )}
      <p className="mt-4 text-xs leading-relaxed text-ui-fg-subtle">
        No phone number is collected on this page. Your information is included
        only in a WhatsApp draft, which you can review or discard. This is an
        enquiry, not an order or a shipping-rate guarantee. Online payment
        and courier booking are currently unavailable.
      </p>
    </section>
  )
}
