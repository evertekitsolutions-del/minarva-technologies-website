import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

async function providerHealth(adminClient: ReturnType<typeof createClient>) {
  const { data, error } = await adminClient
    .from("customer_care_provider_adapters")
    .select("adapter_key,channel,display_name,adapter_type,enabled,runtime_mode,health_status,last_health_check_at,last_health_error,config")
    .order("channel", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => ({
    adapter_key: row.adapter_key,
    channel: row.channel,
    display_name: row.display_name,
    adapter_type: row.adapter_type,
    enabled: row.enabled,
    runtime_mode: row.runtime_mode,
    health_status: row.health_status,
    last_health_check_at: row.last_health_check_at,
    last_health_error: row.last_health_error,
    mock: Boolean((row.config as Record<string, unknown> | null)?.mock),
    external_contact: Boolean((row.config as Record<string, unknown> | null)?.external_contact),
  }));
}

async function testRecipientAllowed(
  adminClient: ReturnType<typeof createClient>,
  channel: string,
  recipient: string,
) {
  const { data, error } = await adminClient
    .from("customer_care_test_allowlist")
    .select("id")
    .eq("channel", channel)
    .eq("recipient", recipient)
    .eq("active", true)
    .limit(1);

  if (error) throw error;
  return Boolean(data?.length);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "Server runtime is missing Supabase service credentials" }, 500);
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    await requireAdmin(req, adminClient);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "health");

    if (action === "health") {
      return json({
        ok: true,
        live_outbound_enabled: false,
        providers: await providerHealth(adminClient),
      });
    }

    if (action !== "dispatch") {
      return json({ error: "Unsupported action" }, 400);
    }

    const limit = Math.max(1, Math.min(Number(body?.limit ?? 20), 100));

    const { data: prepared, error: prepareError } = await adminClient.rpc(
      "customer_care_worker_prepare_dispatch",
      { p_limit: Math.max(limit, 100) },
    );
    if (prepareError) throw prepareError;

    const { data: claimed, error: claimError } = await adminClient.rpc(
      "customer_care_worker_claim",
      { p_limit: limit },
    );
    if (claimError) throw claimError;

    const attempts = Array.isArray(claimed) ? claimed : [];
    const results: Record<string, unknown>[] = [];

    for (const attempt of attempts) {
      const attemptId = String(attempt.attempt_id ?? "");
      const adapterKey = String(attempt.provider_adapter_key ?? "");
      const channel = String(attempt.channel ?? "");
      const recipient = String(attempt.recipient ?? "");
      const runtimeMode = String(attempt.runtime_mode ?? "disabled");
      const providerConfig = (attempt.provider_config ?? {}) as Record<string, unknown>;
      const isMock = providerConfig.mock === true && providerConfig.external_contact !== true;

      let status = "failed";
      let providerMessageId: string | null = null;
      let providerResponse: Record<string, unknown> = {};
      let errorMessage: string | null = null;

      try {
        if (runtimeMode === "disabled") {
          throw new Error("Provider adapter is disabled");
        }

        if (runtimeMode === "test" && !isMock) {
          const allowed = await testRecipientAllowed(adminClient, channel, recipient);
          if (!allowed) {
            status = "suppressed";
            errorMessage = "Recipient is not on the test allowlist";
          } else {
            throw new Error("External test adapter implementation is not installed");
          }
        } else if (runtimeMode === "live") {
          throw new Error("Live outbound adapter is intentionally not installed in this milestone");
        } else if (isMock) {
          status = "sent";
          providerMessageId = "mock_" + crypto.randomUUID();
          providerResponse = {
            mode: "sandbox",
            simulated: true,
            external_contact: false,
            adapter_key: adapterKey,
            channel,
          };
        } else {
          throw new Error("Unsupported adapter configuration");
        }
      } catch (error) {
        if (status !== "suppressed") {
          status = "failed";
          errorMessage = error instanceof Error ? error.message : String(error);
        }
      }

      const { data: finished, error: finishError } = await adminClient.rpc(
        "customer_care_worker_finish",
        {
          p_attempt_id: attemptId,
          p_status: status,
          p_provider_message_id: providerMessageId,
          p_provider_response: providerResponse,
          p_error_message: errorMessage,
          p_mock: isMock,
        },
      );

      if (finishError) {
        results.push({
          attempt_id: attemptId,
          adapter_key: adapterKey,
          status: "worker_finish_failed",
          error: finishError.message,
        });
        continue;
      }

      await adminClient.rpc("customer_care_worker_update_health", {
        p_adapter_key: adapterKey,
        p_health_status: isMock ? "ready" : status === "sent" ? "ready" : "error",
        p_error: status === "sent" ? null : errorMessage,
      });

      results.push({
        attempt_id: attemptId,
        adapter_key: adapterKey,
        channel,
        recipient_masked: recipient
          ? recipient.length > 4
            ? "*".repeat(Math.max(0, recipient.length - 4)) + recipient.slice(-4)
            : "****"
          : "",
        status: finished?.status ?? status,
        mock: isMock,
        external_contact: false,
        provider_message_id: providerMessageId,
        error: errorMessage,
      });
    }

    return json({
      ok: true,
      mode: "sandbox",
      live_outbound_enabled: false,
      prepared,
      claimed: attempts.length,
      processed: results.length,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const authFailure =
      message.includes("bearer") ||
      message.includes("authenticated") ||
      message.includes("administrator") ||
      message.includes("Invalid");
    return json({ error: message }, authFailure ? 401 : 500);
  }
});
