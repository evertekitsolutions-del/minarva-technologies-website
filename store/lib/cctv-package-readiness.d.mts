export interface CctvPackageAudit {
  readonly ready: boolean
  readonly errors: readonly string[]
  readonly warnings: readonly string[]
  readonly chargeableGrams: number | null
}
export declare function auditCctvPackage(
  product: unknown,
  options?: { countryCode?: string }
): CctvPackageAudit
