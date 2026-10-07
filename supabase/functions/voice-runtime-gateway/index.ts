import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")??"";
function key(){
  const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(legacy)return legacy;
  try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")??"{}").default??""}catch{return ""}
}
const SERVER_KEY=key();

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
};

const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{...cors,"Content-Type":"application/json"}
});

const bearer=(req:Request)=>{
  const h=req.headers.get("authorization")??"";
  return h.toLowerCase().startsWith("bearer ")?h.slice(7).trim():"";
};

async function requireAdmin(req:Request,adminClient:ReturnType<typeof createClient>){
  const token=bearer(req);
  if(!token)throw new Error("Missing bearer token");
  const {data:userData,error:userError}=await adminClient.auth.getUser(token);
  if(userError||!userData.user)throw new Error("Invalid authenticated user");
  const {data:admin,error}=await adminClient.from("admin_users")
    .select("user_id,email,role,active").eq("user_id",userData.user.id).maybeSingle();
  if(error||!admin||admin.active!==true)throw new Error("Active administrator access is required");
  return {user:userData.user,admin};
}

const contracts={
  stt:{
    request:{
      request_id:"uuid",
      session_id:"uuid|null",
      language:"ml|en",
      audio:{
        encoding:"pcm_s16le",
        container:"wav",
        sample_rate_hz:16000,
        channels:1,
        duration_ms:"integer",
        source:"storage_path|stream"
      },
      options:{
        vad_enabled:true,
        timestamps:true
      }
    },
    response:{
      request_id:"uuid",
      status:"completed|failed",
      text_redacted:"string",
      detected_language:"ml|en",
      segments:"[{start_ms,end_ms,text_redacted}]",
      metrics:{latency_ms:"integer",realtime_factor:"number|null"}
    }
  },
  tts:{
    request:{
      request_id:"uuid",
      session_id:"uuid|null",
      language:"ml|en",
      text_redacted:"string",
      voice_key:"string|null",
      audio_format:"wav|pcm_s16le",
      sample_rate_hz:16000
    },
    response:{
      request_id:"uuid",
      status:"completed|failed",
      audio:{storage_path:"string|null",content_type:"audio/wav",duration_ms:"integer|null"},
      metrics:{latency_ms:"integer"}
    }
  },
  telephony_event:{
    adapter_key:"string",
    provider_event_id:"string",
    event_type:"call_created|ringing|answered|dtmf|media_started|media_stopped|voicemail|busy|no_answer|hangup|failed",
    call_leg_id:"string|null",
    provider_call_id:"string|null",
    ai_session_id:"uuid|null",
    occurred_at:"ISO-8601",
    payload_redacted:"object"
  }
};

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return respond({error:"POST required"},405);
  if(!SUPABASE_URL||!SERVER_KEY)return respond({error:"Server runtime is missing Supabase server credentials"},500);

  const adminClient=createClient(SUPABASE_URL,SERVER_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

  try{
    await requireAdmin(req,adminClient);
    const body=await req.json().catch(()=>({}));
    const action=String(body?.action??"health");

    if(action==="contracts"){
      return respond({
        ok:true,
        live_audio_processing:false,
        live_telephony:false,
        contracts
      });
    }

    if(action==="health"){
      const [profileRes,adaptersRes,benchRes,telRes]=await Promise.all([
        adminClient.from("voice_runtime_profiles").select("*").eq("singleton",true).maybeSingle(),
        adminClient.from("ai_speech_adapters").select("adapter_key,capability,display_name,runtime,enabled,production_approved,license,notes").order("capability"),
        adminClient.from("voice_benchmark_runs").select("id,adapter_key,capability,language,corpus_label,sample_count,hardware_label,runtime_version,median_latency_ms,p95_latency_ms,realtime_factor,word_error_rate,character_error_rate,tts_mos_proxy,memory_peak_mb,created_at").order("created_at",{ascending:false}).limit(100),
        adminClient.from("telephony_adapter_contracts").select("adapter_key,display_name,provider_family,enabled,live_enabled,webhook_enabled,supports_outbound,supports_inbound,supports_dtmf,supports_recording,supports_streaming_audio,supports_voicemail_detection,currency,notes").order("adapter_key")
      ]);
      for(const r of [profileRes,adaptersRes,benchRes,telRes])if(r.error)throw r.error;
      return respond({
        ok:true,
        live_audio_processing:false,
        live_telephony:false,
        profile:profileRes.data,
        adapters:adaptersRes.data??[],
        benchmarks:benchRes.data??[],
        telephony:telRes.data??[],
        contracts
      });
    }

    if(action==="probe"){
      const capability=String(body?.capability??"");
      if(!["stt","tts"].includes(capability))return respond({error:"capability must be stt or tts"},400);
      return respond({
        ok:false,
        status:"not_connected",
        capability,
        reason:"No self-hosted speech worker is connected yet. Contract validation is ready, but audio processing is intentionally not simulated.",
        live_audio_processing:false
      },409);
    }

    return respond({error:"Unsupported action"},400);
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    const authFail=/bearer|authenticated|administrator|invalid authenticated/i.test(message);
    return respond({error:message},authFail?401:500);
  }
});
