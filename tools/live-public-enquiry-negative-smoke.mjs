import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

// Production negative-path smoke ONLY. Invalid names prevent all CRM writes,
// even if an API consent regression occurs. Never send a valid customer enquiry.
const frontend=readFileSync('assets/enquiry-form.js','utf8')
const projectUrl=frontend.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[0]
const publicKey=frontend.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0]
assert.ok(projectUrl&&publicKey,'Read-only smoke needs the existing public Supabase configuration')
const url=projectUrl+'/functions/v1/public-enquiry-submit'
const allowed='https://www.minarvatechnologies.com'
const forbidden='https://invalid-origin.example'
const invalidForm={name:'',phone:'',service:'Complete Technology Solution',message:'',company_website:'',form_started_at:Date.now()-3000}

async function negativeCase(label,body,origin,expectedStatus,expectedError){
  const response=await fetch(url,{
    method:'POST',
    headers:{'Content-Type':'application/json',apikey:publicKey,Origin:origin},
    body:JSON.stringify(body),
    signal:AbortSignal.timeout(15000)
  })
  const text=await response.text()
  let data
  try{data=JSON.parse(text)}catch{throw Error(label+': expected JSON; got HTTP '+response.status)}
  assert.equal(response.status,expectedStatus,label+': unexpected HTTP status')
  assert.equal(data.error,expectedError,label+': unexpected rejection reason')
  assert.equal(data.accepted,undefined,label+': must not claim acceptance')
}
await negativeCase('consent omitted',invalidForm,allowed,400,'Contact consent is required to submit an enquiry.')
await negativeCase('consent false',{...invalidForm,consent_to_contact:false},allowed,400,'Contact consent is required to submit an enquiry.')
await negativeCase('invalid name with consent',{...invalidForm,consent_to_contact:true},allowed,400,'Please enter a valid name.')
await negativeCase('origin forbidden',{...invalidForm,consent_to_contact:true},forbidden,403,'Origin not allowed')
console.log(JSON.stringify({ok:true,checks:4,realEnquiriesCreated:0,scope:'production-negative-path-only'}))
