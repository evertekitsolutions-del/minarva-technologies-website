import { PRICE_CURRENCIES, toProductPricing } from "../../search/helpers/pricing"

describe("Minarva Kerala INR indexed catalogue search", () => {
  test("index schema explicitly supports Indian rupees", () => {
    expect(PRICE_CURRENCIES).toContain("inr")
  })

  test("INR variant price is indexed exactly without conversion or foreign fallback", () => {
    const result = toProductPricing({
      inr: [
        { calculated_price: { calculated_amount: 12900, original_amount: 14900 } },
        { calculated_price: { calculated_amount: 17900, original_amount: 17900 } },
      ],
    })
    expect(result.min_price_inr).toBe(12900)
    expect(result.max_price_inr).toBe(17900)
    expect(result.original_price_inr).toBe(14900)
    expect(result.on_sale_inr).toBe(true)
    expect(result).not.toHaveProperty("min_price_eur")
    expect(result).not.toHaveProperty("min_price_usd")
  })

  test("missing INR does not fabricate an INR amount from foreign price rows", () => {
    const result = toProductPricing({
      eur: [{ calculated_price: { calculated_amount: 150, original_amount: 150 } }],
      usd: [{ calculated_price: { calculated_amount: 170, original_amount: 170 } }],
    })
    expect(result).not.toHaveProperty("min_price_inr")
    expect(result.min_price_eur).toBe(150)
    expect(result.min_price_usd).toBe(170)
  })

  test("invalid, free or missing prices cannot become an INR search offer", () => {
    const result = toProductPricing({
      inr: [
        null,
        { calculated_price: { calculated_amount: null } },
        { calculated_price: { calculated_amount: Number.NaN } },
        { calculated_price: { calculated_amount: Number.POSITIVE_INFINITY } },
        { calculated_price: { calculated_amount: 0 } },
        { calculated_price: { calculated_amount: -120 } },
      ],
    })
    expect(result).not.toHaveProperty("min_price_inr")
    expect(result).not.toHaveProperty("on_sale_inr")
  })
})
