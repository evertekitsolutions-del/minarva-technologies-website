import { approvedIndiaStagingDb } from "../init-india-region"

const good = () => ({
  NODE_ENV:"development",
  DATABASE_URL:"postgresql://test:test@127.0.0.1:5432/minarva_store_ci",
  STORE_INR_REGION_STAGING_ENABLED:"true",
  STORE_INR_REGION_STAGING_APPROVED:"true",
  STORE_INR_REGION_STAGING_DB_NAME:"minarva_store_ci",
})
describe("Medusa India INR native staging bootstrap safety",()=>{
  test("only exact named isolated database and both opt-ins permit bootstrap",()=>{
    expect(approvedIndiaStagingDb(good())).toBe(true)
    expect(approvedIndiaStagingDb({...good(),
      DATABASE_URL:"postgres://test:test@127.0.0.1:5432/minarva_store_staging",
      STORE_INR_REGION_STAGING_DB_NAME:"minarva_store_staging",
    })).toBe(true)
  })
  test("production never writes even when everything else is set",()=>{
    expect(approvedIndiaStagingDb({...good(),NODE_ENV:"production"})).toBe(false)
  })
  test("missing approval and arbitrary non-isolated DB are denied",()=>{
    for(const change of [
      {STORE_INR_REGION_STAGING_ENABLED:"false"},
      {STORE_INR_REGION_STAGING_APPROVED:"false"},
      {STORE_INR_REGION_STAGING_DB_NAME:"wrong_db"},
      {DATABASE_URL:"postgresql://test:test@127.0.0.1:5432/minarva_store"},
      {DATABASE_URL:"postgresql://test:test@127.0.0.1:5432/minarva_store_ci?sslmode=disable"},
      {DATABASE_URL:""},
    ]){
      expect(approvedIndiaStagingDb({...good(),...change})).toBe(false)
    }
  })
})
