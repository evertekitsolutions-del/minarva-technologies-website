import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
function serverKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    return keys.default ?? "";
  } catch {
    return "";
  }
}
const SERVER_KEY = serverKey();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bearer(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

async function requireAdmin(req: Request, adminClient: ReturnType<typeof createClient>) {
  const token = bearer(req);
  if (!token) throw new Error("Missing bearer token");

  const { data: userData, error: userError } = await adminClient.auth.getUser(token);
  if (userError || !userData.user) throw new Error("Invalid authenticated user");

  const { data: admin, error: adminError } = await adminClient
    .from("admin_users")
    .select("user_id,email,role,active")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (adminError || !admin || admin.active !== true) {
    throw new Error("Active administrator access is required");
  }

  return { user: userData.user, admin };
}

function redactPII(input: string) {
  let text = String(input ?? "").trim();
  text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]");
  text = text.replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, "[PHONE]");
  text = text.replace(/\b\d{12,19}\b/g, "[SENSITIVE_NUMBER]");
  return text.slice(0, 4000);
}

function normalized(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[.,!?;:()[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type IntentResult = { intent: string; confidence: number };

function hasAny(text: string, values: string[]) {
  return values.some((v) => text.includes(v));
}

function detectIntent(input: string): IntentResult {
  const t = normalized(input);

  if (hasAny(t, [
    "do not call", "don't call", "dont call", "stop calling", "unsubscribe", "opt out",
    "വിളിക്കരുത്", "വിളിക്കണ്ട", "ഇനി വിളിക്കരുത്", "കോൾ വേണ്ട", "call venda", "vilikkaruth",
  ])) return { intent: "opt_out", confidence: 0.99 };

  if (hasAny(t, [
    "wrong number", "not me", "you have the wrong", "തെറ്റായ നമ്പർ", "എന്റെ നമ്പർ അല്ല",
    "ആൾ മാറി", "wrong person", "number തെറ്റി",
  ])) return { intent: "wrong_number", confidence: 0.98 };

  if (hasAny(t, [
    "already paid", "payment done", "paid already", "i paid", "have paid",
    "അടച്ചു", "പണം അടച്ചു", "പേയ്മെന്റ് ചെയ്തു", "payment ചെയ്തു", "already അടച്ചു",
  ])) return { intent: "already_paid", confidence: 0.97 };

  if (hasAny(t, [
    "will pay", "i'll pay", "i will pay", "pay tomorrow", "pay today", "pay later",
    "അടയ്ക്കാം", "അടക്കും", "നാളെ അടയ്ക്കാം", "ഇന്ന് അടയ്ക്കാം", "payment ചെയ്യും",
    "pay cheyyam", "adakkam",
  ])) return { intent: "promise_to_pay", confidence: 0.93 };

  if (hasAny(t, [
    "dispute", "wrong invoice", "wrong bill", "amount wrong", "incorrect amount",
    "not my invoice", "ബിൽ തെറ്റ്", "ഇൻവോയ്സ് തെറ്റ്", "തുക തെറ്റ്", "എന്റെ ബിൽ അല്ല",
    "charge തെറ്റ്",
  ])) return { intent: "dispute", confidence: 0.96 };

  if (hasAny(t, [
    "call later", "call me later", "callback", "call back", "later call",
    "പിന്നീട് വിളിക്കൂ", "പിന്നെ വിളിക്കൂ", "കുറച്ചു കഴിഞ്ഞ് വിളിക്കൂ", "callback വേണം",
    "pinne vilikku", "later വിളിക്കൂ",
  ])) return { intent: "need_callback", confidence: 0.95 };

  if (hasAny(t, [
    "human", "agent", "person", "manager", "speak to someone", "talk to someone",
    "ആളോട് സംസാരിക്കണം", "സ്റ്റാഫിനോട് സംസാരിക്കണം", "മാനേജറെ വേണം", "human agent",
  ])) return { intent: "human_escalation", confidence: 0.96 };

  if (hasAny(t, [
    "not fixed", "still issue", "still problem", "not working", "issue remains",
    "ശരിയായില്ല", "പ്രശ്നം ഇപ്പോഴും", "വർക്ക് ചെയ്യുന്നില്ല", "ഇനിയും പ്രശ്നം",
  ])) return { intent: "service_unresolved", confidence: 0.92 };

  if (hasAny(t, [
    "yes fine", "all good", "working fine", "resolved", "satisfied", "okay now", "ok now",
    "ശരി ആയി", "ഇപ്പോൾ ശരിയാണ്", "പ്രശ്നമില്ല", "നന്നായി പ്രവർത്തിക്കുന്നു", "ഓക്കേ ആണ്",
  ])) return { intent: "service_resolved", confidence: 0.9 };

  if (hasAny(t, [
    "okay", "ok", "yes", "fine", "thanks", "thank you", "ശരി", "ഓക്കെ", "നന്ദി",
  ])) return { intent: "acknowledged", confidence: 0.78 };

  if (hasAny(t, [
    "no", "not interested", "don't know", "dont know", "ഇല്ല", "അറിയില്ല",
  ])) return { intent: "negative_or_unclear", confidence: 0.65 };

  return { intent: "unknown", confidence: 0.35 };
}

function pickLanguage(value: unknown) {
  return String(value ?? "").toLowerCase() === "en" ? "en" : "ml";
}

function fmtMoney(currency: string | null, value: unknown) {
  const n = Number(value ?? 0);
  const code = currency || "INR";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return code + " " + n.toFixed(2);
  }
}

function firstMessage(
  language: string,
  goal: string,
  customerName: string,
  context: Record<string, unknown>,
) {
  const ml = language === "ml";
  const name = customerName || (ml ? "കസ്റ്റമർ" : "Customer");

  if (goal === "invoice_payment_reminder") {
    const inv = String(context.invoice_number ?? "");
    const amount = String(context.balance_due_display ?? "");
    const due = String(context.due_date ?? "");
    return ml
      ? `നമസ്കാരം ${name}. Minarva Technologies-ന്റെ AI customer-care sandbox ആണ്. ${inv ? inv + " ഇൻവോയ്സുമായി ബന്ധപ്പെട്ട് " : ""}${amount ? amount + " തുക " : "ബാക്കി തുക "}${due ? due + "-ന് " : ""}അടയ്ക്കാനുണ്ടെന്ന ഓർമ്മപ്പെടുത്തലാണ്. ഇതിനകം payment ചെയ്തോ, payment ചെയ്യാൻ ഉദ്ദേശിക്കുന്നുണ്ടോ, അല്ലെങ്കിൽ സഹായം ആവശ്യമുണ്ടോ?`
      : `Hello ${name}. This is the Minarva Technologies AI customer-care sandbox. ${inv ? "Regarding invoice " + inv + ", " : ""}${amount ? amount + " " : "the outstanding balance "}${due ? "is due on " + due + ". " : "is due. "}Have you already paid, do you plan to pay, or do you need assistance?`;
  }

  if (goal === "service_follow_up") {
    const job = String(context.job_number ?? "");
    const service = String(context.service_category ?? "service");
    return ml
      ? `നമസ്കാരം ${name}. Minarva Technologies-ന്റെ AI customer-care sandbox ആണ്. ${job ? job + " " : ""}${service} സർവീസിന്റെ follow-up ആണ്. ഇപ്പോൾ എല്ലാം ശരിയായി പ്രവർത്തിക്കുന്നുണ്ടോ, അല്ലെങ്കിൽ ഇനിയും സഹായം ആവശ്യമുണ്ടോ?`
      : `Hello ${name}. This is the Minarva Technologies AI customer-care sandbox following up on ${job ? job + " " : ""}${service}. Is everything working properly now, or do you still need help?`;
  }

  if (goal === "technician_eta_update") {
    const job = String(context.job_number ?? "");
    const eta = String(context.technician_eta_at ?? context.scheduled_at ?? "");
    return ml
      ? `നമസ്കാരം ${name}. Minarva Technologies-ന്റെ AI customer-care sandbox ആണ്. ${job ? job + " " : ""}സർവീസിനുള്ള technician update ആണ്. ${eta ? "നിലവിലെ ETA " + eta + " ആണ്. " : ""}ഈ സമയം സൗകര്യമാണോ, അല്ലെങ്കിൽ callback/സഹായം വേണമോ?`
      : `Hello ${name}. This is the Minarva Technologies AI customer-care sandbox with a technician update for ${job || "your service job"}. ${eta ? "The current ETA is " + eta + ". " : ""}Is that suitable, or would you like a callback or assistance?`;
  }

  if (goal === "callback_handling") {
    return ml
      ? `നമസ്കാരം ${name}. നിങ്ങൾ അഭ്യർത്ഥിച്ച callback-ന്റെ Minarva Technologies AI customer-care sandbox follow-up ആണ്. എങ്ങനെ സഹായിക്കാം?`
      : `Hello ${name}. This is the Minarva Technologies AI customer-care sandbox following up on your requested callback. How can we help?`;
  }

  return ml
    ? `നമസ്കാരം ${name}. Minarva Technologies-ന്റെ AI customer-care sandbox ആണ്. ഇന്ന് എന്ത് സഹായമാണ് ആവശ്യം?`
    : `Hello ${name}. This is the Minarva Technologies AI customer-care sandbox. How can we help you today?`;
}

function clarification(language: string, goal: string) {
  const ml = language === "ml";
  if (goal === "invoice_payment_reminder") {
    return ml
      ? "Payment ഇതിനകം ചെയ്തോ, payment ചെയ്യാൻ ഉദ്ദേശിക്കുന്നുണ്ടോ, invoice-ൽ എന്തെങ്കിലും dispute ഉണ്ടോ, അല്ലെങ്കിൽ പിന്നീട് വിളിക്കണോ?"
      : "Have you already paid, do you plan to pay, is there an invoice dispute, or should we call you back later?";
  }
  if (goal === "service_follow_up") {
    return ml
      ? "Service ഇപ്പോൾ ശരിയായി പ്രവർത്തിക്കുന്നുണ്ടോ, പ്രശ്നം തുടരുന്നുണ്ടോ, അല്ലെങ്കിൽ ഒരു staff callback വേണമോ?"
      : "Is the service working properly now, is the problem still present, or would you like a staff callback?";
  }
  return ml
    ? "കുറച്ചുകൂടി വ്യക്തമായി പറയാമോ? Callback, human support, service issue, payment issue എന്നിവയിൽ ഏതാണ് വേണ്ടത്?"
    : "Could you clarify a little? Do you need a callback, human support, service help, or payment help?";
}

function responseFor(language: string, goal: string, intent: string, callbackAt?: string | null) {
  const ml = language === "ml";

  const map: Record<string, [string, string, string | null]> = {
    opt_out: [
      ml ? "ശരി. ഇനി automated calls ചെയ്യാതിരിക്കാൻ നിങ്ങളുടെ call preference update ചെയ്യുന്നു." : "Understood. We will update your preference so automated calls are not made to you.",
      "opted_out",
      "opt_out",
    ],
    wrong_number: [
      ml ? "ക്ഷമിക്കണം. ഇത് wrong number ആയി രേഖപ്പെടുത്തി human review-ലേക്ക് അയക്കുന്നു." : "Sorry about that. We will mark this as a wrong-number case and send it for human review.",
      "escalated",
      "wrong_number",
    ],
    already_paid: [
      ml ? "നന്ദി. Payment ചെയ്തതായി രേഖപ്പെടുത്തി verification-നായി വിടുന്നു. Invoice payment status സ്വമേധയാ മാറ്റുന്നില്ല." : "Thank you. We will record that you report the payment as completed and leave it for verification. The invoice payment status is not changed automatically.",
      "completed",
      "already_paid",
    ],
    promise_to_pay: [
      ml ? "ശരി, payment ചെയ്യാമെന്ന് രേഖപ്പെടുത്തി. നന്ദി." : "Understood. We will record your promise to pay. Thank you.",
      "completed",
      "promise_to_pay",
    ],
    dispute: [
      ml ? "ശരി. Invoice/payment dispute ആയി രേഖപ്പെടുത്തി human team review-ലേക്ക് escalate ചെയ്യുന്നു." : "Understood. We will record this as an invoice/payment dispute and escalate it to the human team.",
      "escalated",
      "dispute",
    ],
    need_callback: [
      ml ? `ശരി. Callback schedule ചെയ്തു${callbackAt ? " — " + new Date(callbackAt).toLocaleString("en-IN") : ""}.` : `Okay. A callback has been scheduled${callbackAt ? " for " + new Date(callbackAt).toLocaleString("en-IN") : ""}.`,
      "callback_required",
      "callback_required",
    ],
    human_escalation: [
      ml ? "ശരി. Human customer-care follow-up ആയി escalate ചെയ്യുന്നു." : "Understood. We will escalate this for human customer-care follow-up.",
      "escalated",
      "human_requested",
    ],
    service_unresolved: [
      ml ? "പ്രശ്നം തുടരുന്നതായി രേഖപ്പെടുത്തി human service follow-up-ലേക്ക് escalate ചെയ്യുന്നു." : "We will record that the issue is still unresolved and escalate it for human service follow-up.",
      "escalated",
      "service_unresolved",
    ],
    service_resolved: [
      ml ? "വളരെ നല്ലത്. Service ശരിയായി പ്രവർത്തിക്കുന്നതായി രേഖപ്പെടുത്തി. Minarva Technologies തിരഞ്ഞെടുക്കിയതിന് നന്ദി." : "Great. We will record that the service is working properly. Thank you for choosing Minarva Technologies.",
      "completed",
      "service_resolved",
    ],
  };

  if (map[intent]) return map[intent];

  if (intent === "acknowledged" && goal === "technician_eta_update") {
    return [
      ml ? "നന്ദി. Technician update acknowledge ചെയ്തതായി രേഖപ്പെടുത്തി." : "Thank you. We will record that you acknowledged the technician update.",
      "completed",
      "eta_acknowledged",
    ] as [string, string, string | null];
  }

  return [clarification(language, goal), "active", null];
}

async function buildContext(
  adminClient: ReturnType<typeof createClient>,
  customerId: string,
  sourceType: string,
  sourceId: string | null,
) {
  const context: Record<string, unknown> = {};

  if (sourceType === "invoice" && sourceId) {
    const { data } = await adminClient
      .from("invoices")
      .select("id,invoice_number,due_date,currency,total_amount,amount_paid,balance_due,payment_status,status")
      .eq("id", sourceId)
      .eq("customer_id", customerId)
      .maybeSingle();

    if (data) {
      Object.assign(context, data, {
        balance_due_display: fmtMoney(data.currency, data.balance_due),
      });
    }
  }

  if (sourceType === "service_job" && sourceId) {
    const { data } = await adminClient
      .from("service_jobs")
      .select("id,job_number,service_category,status,scheduled_at,technician_eta_at,technician_eta_note,resolution_status,follow_up_at")
      .eq("id", sourceId)
      .eq("customer_id", customerId)
      .maybeSingle();

    if (data) Object.assign(context, data);
  }

  return context;
}

async function checkCallPermission(
  adminClient: ReturnType<typeof createClient>,
  customerId: string,
) {
  const { data: customer, error } = await adminClient
    .from("customers")
    .select("id,name,phone,email,preferred_language,call_consent,do_not_call")
    .eq("id", customerId)
    .maybeSingle();

  if (error || !customer) throw new Error("Customer not found");

  const { data: pref } = await adminClient
    .from("customer_contact_preferences")
    .select("opted_out")
    .eq("customer_id", customerId)
    .eq("channel", "call")
    .maybeSingle();

  const optedOut = pref?.opted_out === true;
  return {
    customer,
    allowed:
      customer.call_consent === true &&
      customer.do_not_call !== true &&
      !optedOut &&
      Boolean(String(customer.phone ?? "").trim()),
    optedOut,
  };
}

async function settings(adminClient: ReturnType<typeof createClient>) {
  const { data } = await adminClient
    .from("ai_voice_engine_settings")
    .select("*")
    .eq("singleton", true)
    .maybeSingle();

  return data ?? {
    sandbox_enabled: true,
    live_telephony_enabled: false,
    default_language: "ml",
    max_turns: 12,
    default_callback_delay_minutes: 120,
    pii_redaction_enabled: true,
  };
}

function callbackTime(delayMinutes: number, preferred?: string | null) {
  if (preferred) {
    const d = new Date(preferred);
    if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now()) return d.toISOString();
  }
  return new Date(Date.now() + Math.max(15, delayMinutes || 120) * 60_000).toISOString();
}

async function transcript(adminClient: ReturnType<typeof createClient>, sessionId: string) {
  const { data: session, error: sessionError } = await adminClient
    .from("ai_call_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError || !session) throw new Error("AI call session not found");

  const { data: turns, error: turnError } = await adminClient
    .from("ai_call_turns")
    .select("id,sequence_no,speaker,text_redacted,detected_intent,confidence,metadata,created_at")
    .eq("session_id", sessionId)
    .order("sequence_no", { ascending: true });

  if (turnError) throw turnError;
  return { session, turns: turns ?? [] };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  if (!SUPABASE_URL || !SERVER_KEY) {
    return json({ error: "Server runtime is missing Supabase server credentials" }, 500);
  }

  const adminClient = createClient(SUPABASE_URL, SERVER_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const auth = await requireAdmin(req, adminClient);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "health");
    const engineSettings = await settings(adminClient);

    if (action === "health") {
      const { data: adapters } = await adminClient
        .from("ai_speech_adapters")
        .select("adapter_key,capability,display_name,runtime,enabled,production_approved,license,notes")
        .order("capability");

      return json({
        ok: true,
        sandbox_enabled: engineSettings.sandbox_enabled === true,
        live_telephony_enabled: engineSettings.live_telephony_enabled === true,
        engine: "deterministic-rules-nlu",
        external_ai_api: false,
        adapters: adapters ?? [],
      });
    }

    if (engineSettings.sandbox_enabled !== true) {
      return json({ error: "AI voice sandbox is disabled" }, 403);
    }

    if (action === "start") {
      const customerId = String(body?.customer_id ?? "");
      const goal = String(body?.goal ?? "general_customer_care");
      const language = pickLanguage(body?.language ?? engineSettings.default_language);
      const direction = String(body?.direction ?? "outbound");
      const sourceType = String(body?.source_type ?? "manual");
      const sourceId = body?.source_id ? String(body.source_id) : null;
      const automatedCallJobId = body?.automated_call_job_id
        ? String(body.automated_call_job_id)
        : null;
      const outboxId = body?.outbox_id ? String(body.outbox_id) : null;

      const permission = await checkCallPermission(adminClient, customerId);
      if (direction === "outbound" && !permission.allowed) {
        return json({
          error: "Outbound sandbox call blocked by consent / Do Not Call / phone rules",
          blocked: true,
          call_consent: permission.customer.call_consent,
          do_not_call: permission.customer.do_not_call,
          call_opted_out: permission.optedOut,
        }, 403);
      }

      const context = await buildContext(adminClient, customerId, sourceType, sourceId);

      const { data: started, error: startError } = await adminClient.rpc(
        "customer_care_ai_worker_start_session",
        {
          p_customer_id: customerId,
          p_goal: goal,
          p_language: language,
          p_direction: direction,
          p_source_type: sourceType,
          p_source_id: sourceId,
          p_automated_call_job_id: automatedCallJobId,
          p_outbox_id: outboxId,
          p_context: context,
          p_created_by: auth.user.id,
        },
      );
      if (startError) throw startError;

      const opening = firstMessage(language, goal, permission.customer.name, context);
      const { error: turnError } = await adminClient.rpc("customer_care_ai_worker_add_turn", {
        p_session_id: started.session_id,
        p_speaker: "assistant",
        p_text_redacted: redactPII(opening),
        p_detected_intent: null,
        p_confidence: null,
        p_metadata: { next_state: "awaiting_customer", sandbox: true },
      });
      if (turnError) throw turnError;

      return json({
        ok: true,
        sandbox: true,
        live_telephony_enabled: false,
        session_id: started.session_id,
        assistant_text: opening,
        context,
        ...(await transcript(adminClient, started.session_id)),
      });
    }

    if (action === "turn") {
      const sessionId = String(body?.session_id ?? "");
      const customerTextRaw = String(body?.text ?? "").trim();
      const preferredCallbackAt = body?.preferred_callback_at
        ? String(body.preferred_callback_at)
        : null;

      if (!sessionId || !customerTextRaw) {
        return json({ error: "session_id and text are required" }, 400);
      }

      const current = await transcript(adminClient, sessionId);
      if (current.session.status !== "active") {
        return json({ error: "Session is not active", ...current }, 409);
      }

      const permission = await checkCallPermission(adminClient, current.session.customer_id);
      if (
        current.session.direction === "outbound" &&
        !permission.allowed
      ) {
        const summary = "Conversation stopped because current call consent / Do Not Call rules no longer allow contact.";
        await adminClient.rpc("customer_care_ai_worker_finish_session", {
          p_session_id: sessionId,
          p_status: "blocked",
          p_outcome: "permission_revoked",
          p_summary: summary,
          p_structured_outcome: {
            consent: permission.customer.call_consent,
            do_not_call: permission.customer.do_not_call,
            call_opted_out: permission.optedOut,
          },
          p_callback_at: null,
          p_escalation_reason: "Call permission no longer valid",
        });
        return json({ error: summary, blocked: true, ...(await transcript(adminClient, sessionId)) }, 403);
      }

      const redacted = engineSettings.pii_redaction_enabled === false
        ? customerTextRaw.slice(0, 4000)
        : redactPII(customerTextRaw);
      const intentResult = detectIntent(customerTextRaw);

      const { error: customerTurnError } = await adminClient.rpc(
        "customer_care_ai_worker_add_turn",
        {
          p_session_id: sessionId,
          p_speaker: "customer",
          p_text_redacted: redacted,
          p_detected_intent: intentResult.intent,
          p_confidence: intentResult.confidence,
          p_metadata: { next_state: "processing_intent", pii_redacted: redacted !== customerTextRaw },
        },
      );
      if (customerTurnError) throw customerTurnError;

      const callbackAt = intentResult.intent === "need_callback"
        ? callbackTime(engineSettings.default_callback_delay_minutes, preferredCallbackAt)
        : null;

      const [assistantText, nextStatus, outcome] = responseFor(
        current.session.language,
        current.session.goal,
        intentResult.intent,
        callbackAt,
      );

      const { error: assistantTurnError } = await adminClient.rpc(
        "customer_care_ai_worker_add_turn",
        {
          p_session_id: sessionId,
          p_speaker: "assistant",
          p_text_redacted: redactPII(assistantText),
          p_detected_intent: null,
          p_confidence: null,
          p_metadata: { next_state: nextStatus === "active" ? "awaiting_customer" : "closing" },
        },
      );
      if (assistantTurnError) throw assistantTurnError;

      const latest = await transcript(adminClient, sessionId);
      let finalStatus = nextStatus;
      let finalOutcome = outcome;
      let escalationReason: string | null = null;

      if (
        nextStatus === "active" &&
        Number(latest.session.turn_count ?? 0) >= Number(engineSettings.max_turns ?? 12)
      ) {
        finalStatus = "escalated";
        finalOutcome = "max_turns_exceeded";
        escalationReason = "Sandbox conversation reached the configured maximum number of customer turns";
      }

      if (finalStatus !== "active") {
        if (finalStatus === "escalated" && !escalationReason) {
          escalationReason =
            intentResult.intent === "wrong_number"
              ? "Customer reported wrong number"
              : intentResult.intent === "dispute"
              ? "Customer reported invoice/payment dispute"
              : intentResult.intent === "service_unresolved"
              ? "Customer reported unresolved service issue"
              : intentResult.intent === "human_escalation"
              ? "Customer requested human assistance"
              : "AI conversation escalated";
        }

        const summary =
          "AI sandbox conversation outcome: " +
          String(finalOutcome ?? finalStatus).replaceAll("_", " ") +
          ". Goal: " +
          current.session.goal.replaceAll("_", " ") +
          ". Intent confidence: " +
          intentResult.confidence.toFixed(2) +
          ".";

        const { error: finishError } = await adminClient.rpc(
          "customer_care_ai_worker_finish_session",
          {
            p_session_id: sessionId,
            p_status: finalStatus,
            p_outcome: finalOutcome ?? finalStatus,
            p_summary: summary,
            p_structured_outcome: {
              detected_intent: intentResult.intent,
              intent_confidence: intentResult.confidence,
              sandbox: true,
              external_contact: false,
              payment_status_changed: false,
              pii_redaction_enabled: engineSettings.pii_redaction_enabled === true,
            },
            p_callback_at: callbackAt,
            p_escalation_reason: escalationReason,
          },
        );
        if (finishError) throw finishError;
      }

      return json({
        ok: true,
        sandbox: true,
        assistant_text: assistantText,
        detected_intent: intentResult.intent,
        confidence: intentResult.confidence,
        callback_at: callbackAt,
        status: finalStatus,
        outcome: finalOutcome,
        ...(await transcript(adminClient, sessionId)),
      });
    }

    if (action === "end") {
      const sessionId = String(body?.session_id ?? "");
      if (!sessionId) return json({ error: "session_id is required" }, 400);

      const current = await transcript(adminClient, sessionId);
      if (current.session.status === "active") {
        const { error } = await adminClient.rpc("customer_care_ai_worker_finish_session", {
          p_session_id: sessionId,
          p_status: "abandoned",
          p_outcome: "manual_end",
          p_summary: "AI sandbox conversation ended manually by administrator.",
          p_structured_outcome: { sandbox: true, external_contact: false },
          p_callback_at: null,
          p_escalation_reason: null,
        });
        if (error) throw error;
      }
      return json({ ok: true, ...(await transcript(adminClient, sessionId)) });
    }

    if (action === "session") {
      const sessionId = String(body?.session_id ?? "");
      if (!sessionId) return json({ error: "session_id is required" }, 400);
      return json({ ok: true, ...(await transcript(adminClient, sessionId)) });
    }

    return json({ error: "Unsupported action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const authFailure =
      message.includes("bearer") ||
      message.includes("authenticated") ||
      message.includes("administrator") ||
      message.includes("Invalid authenticated");
    return json({ error: message }, authFailure ? 401 : 500);
  }
});
