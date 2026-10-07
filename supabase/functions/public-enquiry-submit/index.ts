import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")??"";

function serverKey(){
  const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(legacy)return legacy;
  try{
    const keys=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")??"{}");
    return keys.default??"";
  }catch{return ""}
}
const SERVER_KEY=serverKey();

const ALLOWED_ORIGINS=new Set([
  "https://minarvatechnologies.com",
  "https://www.minarvatechnologies.com",
  "https://minarva-technologies-website.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

const ALLOWED_SERVICES=new Set([
  "CCTV Camera Sales / Installation / Service",
  "CCTV & Security Systems",
  "Computer & Laptop Sales / Service",
  "Networking & Wi-Fi",
  "Solar & Inverters",
  "Home & Office Automation",
  "Customized Software Solutions",
  "Website Development",
  "Complete Technology Solution"
]);

function cors(origin:string){
  return {
    "Access-Control-Allow-Origin":origin,
    "Vary":"Origin",
    "Access-Control-Allow-Headers":"content-type, apikey, authorization, x-client-info",
    "Access-Control-Allow-Methods":"POST, OPTIONS",
    "Access-Control-Max-Age":"86400"
  };
}

function response(origin:string,body:unknown,status=200,extra:Record<string,string>={}){
  return new Response(JSON.stringify(body),{
    status,
    headers:{...cors(origin),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...extra}
  });
}

function cleanText(value:unknown,max:number){
  return String(value??"").replace(/\u0000/g,"").trim().slice(0,max);
}

function normalizePhone(value:string){
  return value.replace(/[^0-9+]/g,"");
}

async function digest(value:string){
  const bytes=new TextEncoder().encode(SERVER_KEY+"|"+value);
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

function clientIp(req:Request){
  const cf=req.headers.get("cf-connecting-ip")?.trim();
  if(cf)return cf;
  const xff=req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if(xff)return xff;
  const real=req.headers.get("x-real-ip")?.trim();
  return real||"unknown";
}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin")??"";

  if(req.method==="OPTIONS"){
    if(!ALLOWED_ORIGINS.has(origin))return new Response(null,{status:403});
    return new Response(null,{status:204,headers:cors(origin)});
  }

  if(req.method!=="POST"){
    return new Response(JSON.stringify({error:"POST required"}),{
      status:405,
      headers:{"Content-Type":"application/json","Cache-Control":"no-store"}
    });
  }

  if(!ALLOWED_ORIGINS.has(origin)){
    return new Response(JSON.stringify({error:"Origin not allowed"}),{
      status:403,
      headers:{"Content-Type":"application/json","Cache-Control":"no-store"}
    });
  }

  if(!SUPABASE_URL||!SERVER_KEY){
    return response(origin,{error:"Enquiry service is temporarily unavailable"},503);
  }

  const contentType=(req.headers.get("content-type")??"").toLowerCase();
  if(!contentType.includes("application/json")){
    return response(origin,{error:"JSON body required"},415);
  }

  const length=Number(req.headers.get("content-length")??0);
  if(Number.isFinite(length)&&length>12000){
    return response(origin,{error:"Request too large"},413);
  }

  let body:Record<string,unknown>;
  try{
    body=await req.json();
  }catch{
    return response(origin,{error:"Invalid request body"},400);
  }

  const honeypot=cleanText(body.company_website,200);
  if(honeypot){
    // Do not reveal bot-detection behavior.
    return response(origin,{ok:true,accepted:true});
  }

  const formStartedAt=Number(body.form_started_at??0);
  const now=Date.now();
  const ageMs=now-formStartedAt;
  if(!Number.isFinite(formStartedAt)||formStartedAt<=0||ageMs<1200||ageMs>6*60*60*1000){
    return response(origin,{error:"Please refresh the page and try again."},400);
  }

  const name=cleanText(body.name,121);
  const phone=cleanText(body.phone,31);
  const email=cleanText(body.email,321);
  const service=cleanText(body.service,121);
  const message=cleanText(body.message,4001);

  if(name.length<2||name.length>120){
    return response(origin,{error:"Please enter a valid name."},400);
  }
  if(phone.length<7||phone.length>30||!/^[+0-9() .-]+$/.test(phone)){
    return response(origin,{error:"Please enter a valid phone number."},400);
  }
  if(email&&(email.length>320||!/^[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email))){
    return response(origin,{error:"Please enter a valid email address."},400);
  }
  if(!ALLOWED_SERVICES.has(service)){
    return response(origin,{error:"Please select a valid service."},400);
  }
  if(message.length>4000){
    return response(origin,{error:"Requirement is too long."},400);
  }

  const ip=clientIp(req);
  const ua=cleanText(req.headers.get("user-agent"),500);
  const fingerprintHash=await digest("client:"+ip+"|"+ua);
  const phoneHash=await digest("phone:"+normalizePhone(phone));

  const admin=createClient(SUPABASE_URL,SERVER_KEY,{
    auth:{persistSession:false,autoRefreshToken:false}
  });

  const {data:quota,error:quotaError}=await admin.rpc("consume_public_enquiry_quota",{
    p_fingerprint_hash:fingerprintHash,
    p_phone_hash:phoneHash
  });

  if(quotaError){
    console.error("Enquiry quota check failed",quotaError.message);
    return response(origin,{error:"Enquiry service is temporarily unavailable. Please use WhatsApp."},503);
  }

  if(quota?.allowed!==true){
    return response(
      origin,
      {error:quota?.reason||"Too many recent submissions. Please try again later."},
      429,
      {"Retry-After":"900"}
    );
  }

  const {data:id,error:submitError}=await admin.rpc("submit_public_enquiry",{
    p_name:name,
    p_phone:phone,
    p_email:email||null,
    p_service:service,
    p_message:message||null
  });

  if(submitError){
    console.error("Public enquiry insert failed",submitError.message);
    return response(origin,{error:"We could not save the enquiry right now. Please use WhatsApp."},503);
  }

  return response(origin,{ok:true,accepted:true,enquiry_id:id},201);
});
