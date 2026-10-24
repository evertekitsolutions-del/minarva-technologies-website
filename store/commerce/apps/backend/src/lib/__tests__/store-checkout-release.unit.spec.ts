import { publicCheckoutGate } from "../store-checkout-release"

describe("server-side public cart-completion release gate",()=>{
  test("production may not accept customer checkout even with both flags",()=>{
    expect(publicCheckoutGate({nodeEnv:"production",enabled:"true",approved:"true"})).toBe(false)
  })
  test("staging/development need both explicit approvals",()=>{
    for(const nodeEnv of ["test","development","staging"]){
      expect(publicCheckoutGate({nodeEnv,enabled:"true",approved:"true"})).toBe(true)
      expect(publicCheckoutGate({nodeEnv,enabled:"true",approved:"false"})).toBe(false)
      expect(publicCheckoutGate({nodeEnv,enabled:"false",approved:"true"})).toBe(false)
      expect(publicCheckoutGate({nodeEnv})).toBe(false)
    }
  })
  test("common truthy-like values cannot accidentally open checkout",()=>{
    for(const flag of ["1","yes","TRUE","true ","on","false","0",""]){
      expect(publicCheckoutGate({nodeEnv:"development",enabled:flag,approved:"true"})).toBe(false)
    }
  })
})
