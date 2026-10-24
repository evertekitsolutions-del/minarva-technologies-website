import test from "node:test"
import assert from "node:assert/strict"
import {
  buildShiprocketServiceabilityQuery,
  normalizeShiprocketServiceabilityResponse,
  fetchShiprocketServiceability,
} from "../lib/shiprocket-serviceability.mjs"
import { chooseCourier } from "../lib/checkout-pricing.mjs"

const requestInput = (additional={}) => ({
  pickupPincode:"695020",
  deliveryPincode:"682001",
  actualWeightGrams:400,
  lengthCm:10,breadthCm:10,heightCm:10,
  declaredValuePaise:1290000,
  method:"partial_cod",
  ...additional,
})
const candidates = {
  data:{available_courier_companies:[{
    courier_company_id:43,courier_name:"Surface Test Carrier",
    cod:1,freight_charge:54,cod_charges:18,
    other_charges:8,coverage_charges:0,
    estimated_delivery_days:"4",
  }]},
}

test("official courier endpoint includes actual/volumetric slab weight, PIN and COD mode",()=>{
  const request=buildShiprocketServiceabilityQuery(requestInput())
  const url=new URL(request.url)
  assert.equal(url.hostname,"apiv2.shiprocket.in")
  assert.equal(url.pathname,"/v1/external/courier/serviceability/")
  assert.equal(url.searchParams.get("pickup_postcode"),"695020")
  assert.equal(url.searchParams.get("delivery_postcode"),"682001")
  assert.equal(url.searchParams.get("weight"),"0.500")
  assert.equal(url.searchParams.get("cod"),"1")
  assert.equal(url.searchParams.get("declared_value"),"12900.00")
})

test("volumetric weight and courier slab prevent underquoted bulky packages",()=>{
  const request=buildShiprocketServiceabilityQuery(requestInput({
    actualWeightGrams:500,lengthCm:30,breadthCm:20,heightCm:15,
    method:"prepaid",
  }))
  assert.equal(request.chargedWeightGrams,2000)
  assert.equal(new URL(request.url).searchParams.get("weight"),"2.000")
  assert.equal(new URL(request.url).searchParams.get("cod"),"0")
})

test("bad PIN, weight, dimensions and prices are rejected before transport",()=>{
  for(const modifications of [
    {pickupPincode:"000000"},{deliveryPincode:"abc"},
    {actualWeightGrams:0},{lengthCm:-1},
    {declaredValuePaise:1290000.8},{declaredValuePaise:0},
    {method:"full_cod"},
  ]) {
    assert.throws(()=>buildShiprocketServiceabilityQuery(requestInput(modifications)))
  }
})

test("general COD availability is NOT permission for shipping-advance partial COD",()=>{
  const request=buildShiprocketServiceabilityQuery(requestInput())
  const [carrier]=normalizeShiprocketServiceabilityResponse(candidates,request)
  assert.equal(carrier.codAvailable,true)
  assert.equal(carrier.partialCodSupported,false)
  assert.equal(carrier.bookingAllowed,false)
  assert.equal(carrier.totalChargePaise,null)
  assert.equal(carrier.rateVerifiedAllInclusive,false)
  assert.equal(carrier.componentsRupees.freight,54)
  assert.equal(carrier.componentsRupees.cod,18)
  // Existing user-facing quote selector must not accept incomplete quotes.
  assert.equal(chooseCourier([carrier],{
    method:"partial_cod",destinationPincode:"682001",
  }),null)
  assert(Object.isFrozen(carrier))
})

test("missing all-inclusive fee components never produce a fake shipping total",()=>{
  const request=buildShiprocketServiceabilityQuery(requestInput())
  const [carrier]=normalizeShiprocketServiceabilityResponse({
    data:{available_courier_companies:[{
      courier_company_id:10,courier_name:"Courier Example",cod:0,
      freight_charge:"unknown",estimated_delivery_days:"TBD",
    }]},
  },request)
  assert.equal(carrier.componentsRupees.freight,null)
  assert.equal(carrier.totalChargePaise,null)
  assert.equal(carrier.estimatedDays,null)
  assert.equal(carrier.partialCodSupported,false)
})

test("invalid provider response fails closed without giving rates",()=>{
  const request=buildShiprocketServiceabilityQuery(requestInput())
  for(const response of [null,{}, {data:{}}, {data:{available_courier_companies:"bad"}}]) {
    assert.throws(()=>normalizeShiprocketServiceabilityResponse(response,request),/serviceability/)
  }
})

test("staging read-only official GET requires independent opt-in",async()=>{
  const request=buildShiprocketServiceabilityQuery(requestInput())
  const previous={...process.env}
  let calls=0
  try{
    process.env.NODE_ENV="test"
    process.env.STORE_SHIPROCKET_READONLY_ENABLED="false"
    process.env.STORE_SHIPROCKET_READONLY_APPROVED="false"
    await assert.rejects(()=>fetchShiprocketServiceability({
      request,bearerToken:"test_private_token_123456",
      fetchImpl:async()=>{calls++;return {ok:true,json:async()=>candidates}},
    }),/disabled/)
    assert.equal(calls,0)
  } finally {process.env=previous}
})

test("approved operator receives normalized nonbookable candidates without leaking token",async()=>{
  const request=buildShiprocketServiceabilityQuery(requestInput())
  const previous={...process.env}
  let requests=0
  try {
    process.env.NODE_ENV="test"
    process.env.STORE_SHIPROCKET_READONLY_ENABLED="true"
    process.env.STORE_SHIPROCKET_READONLY_APPROVED="true"
    const result=await fetchShiprocketServiceability({
      request,bearerToken:"private_api_token_123456",
      fetchImpl:async(url,config)=>{
        requests++
        assert.equal(config.method,"GET")
        assert.equal(config.redirect,"error")
        assert.equal(config.headers.Authorization,"Bearer private_api_token_123456")
        assert(!url.includes("private_api_token"))
        return {ok:true,json:async()=>candidates}
      },
    })
    assert.equal(requests,1)
    assert.equal(result.length,1)
    assert.equal(result[0].bookingAllowed,false)
  } finally {process.env=previous}
})

test("production and invalid credential input are both rejected",async()=>{
  const request=buildShiprocketServiceabilityQuery(requestInput())
  const previous={...process.env}
  try {
    process.env.NODE_ENV="production"
    process.env.STORE_SHIPROCKET_READONLY_ENABLED="true"
    process.env.STORE_SHIPROCKET_READONLY_APPROVED="true"
    await assert.rejects(()=>fetchShiprocketServiceability({
      request,bearerToken:"private_api_token_123456",
    }),/disabled/)
    process.env.NODE_ENV="test"
    await assert.rejects(()=>fetchShiprocketServiceability({
      request,bearerToken:"real token with spaces",
    }),/bearer token/)
  } finally {process.env=previous}
})
