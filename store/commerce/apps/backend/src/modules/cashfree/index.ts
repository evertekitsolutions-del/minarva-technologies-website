import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import CashfreeSandboxProvider from "./service"

// Medusa's own Payment Module owns session storage and authoritative payments.
// This integration is available only behind the environment gate in config.
export default ModuleProvider(Modules.PAYMENT, {
  services: [CashfreeSandboxProvider],
})
