import {
  publicCheckoutGate,
  shouldBlockPublicCartMutation,
} from "../store-checkout-release"

describe("Minarva storefront cart-write backend protection", () => {
  test.each(["POST","PATCH","PUT","DELETE"])(
    "denies %s cart write without sandbox authority", (method) => {
      for (const path of [
        "/store/carts",
        "/store/carts/",
        "/store/carts/cart_untrusted/line-items",
        "/store/carts/cart_untrusted/shipping-methods",
        "/store/carts/cart_untrusted/promotions",
        "/store/carts/cart_untrusted/complete",
        "/STORE/CARTS/cart_untrusted/COMPLETE",
      ]) {
        expect(shouldBlockPublicCartMutation({
          path, method, sandboxAuthorized: false,
        })).toBe(true)
      }
    }
  )

  test("read-only GET/HEAD cart inspection remains available", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(shouldBlockPublicCartMutation({
        method, path:"/store/carts/cart_readonly",
        sandboxAuthorized:false,
      })).toBe(false)
    }
  })

  test("Medusa Admin and unrelated public search are unaffected", () => {
    for (const path of [
      "/admin/products",
      "/admin/orders",
      "/store/products",
      "/store/search",
      "/webhooks/cashfree",
      "/store/carts-evil/cart_123/complete",
      "/evil/store/carts/cart_123/complete",
    ]) {
      expect(shouldBlockPublicCartMutation({
        path, method:"POST",sandboxAuthorized:false,
      })).toBe(false)
    }
  })

  test("only isolated sandbox with both flags enables cart writes", () => {
    const grant = publicCheckoutGate({
      nodeEnv:"development",enabled:"true",approved:"true",
    })
    expect(grant).toBe(true)
    expect(shouldBlockPublicCartMutation({
      path:"/store/carts",method:"POST",sandboxAuthorized:grant,
    })).toBe(false)

    for(const env of ["production","test"]){
      const denied=publicCheckoutGate({
        nodeEnv:env,enabled:"true",approved:"false",
      })
      expect(denied).toBe(false)
      expect(shouldBlockPublicCartMutation({
        path:"/store/carts/cart_123/complete",method:"POST",
        sandboxAuthorized:denied,
      })).toBe(true)
    }
  })
})
