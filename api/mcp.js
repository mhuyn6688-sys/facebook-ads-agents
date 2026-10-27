class FacebookApiError extends Error {
  constructor(response, data) {
    const detail = data.error || {};
    const code = detail.code ?? null;
    const subcode = detail.error_subcode ?? detail.subcode ?? null;
    super(`${detail.message ?? `Facebook Graph API request failed (HTTP ${response.status})`} (code: ${code}, subcode: ${subcode})`);
    this.code = code;
    this.subcode = subcode;
  }
}

const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
const TOOL_NAME = "checkFacebookAdsRules";
const TOOL = {
  name: TOOL_NAME,
  description: "Kiểm tra các chiến dịch Facebook Ads đang ACTIVE trong ngày hôm nay và tự động tạm dừng nếu chi tiêu chạm ngưỡng SPEND_LIMIT nhưng 0 kết quả",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
};

async function checkFacebookAdsRules() {
  const rawAccountId = (process.env.FB_AD_ACCOUNT_ID || "").trim();
  const AD_ACCOUNT_ID = rawAccountId
    ? (rawAccountId.startsWith("act_") ? rawAccountId : "act_" + rawAccountId)
    : "";
  const ACCESS_TOKEN = (process.env.FB_ACCESS_TOKEN || "").replace(/\s+/g, "");
  const SPEND_LIMIT = Number(process.env.SPEND_LIMIT || 200000);
  if (!AD_ACCOUNT_ID || !ACCESS_TOKEN) {
    throw new Error("Missing configuration: FB_AD_ACCOUNT_ID and FB_ACCESS_TOKEN are required");
  }
  if (!Number.isFinite(SPEND_LIMIT) || SPEND_LIMIT < 0) {
    throw new Error("Invalid configuration: SPEND_LIMIT must be a non-negative number");
  }

  const filtering = encodeURIComponent(JSON.stringify([
    { field: "campaign.effective_status", operator: "IN", value: ["ACTIVE"] },
  ]));
  const insightsResponse = await fetch(
    `https://graph.facebook.com/v26.0/${AD_ACCOUNT_ID}/insights?level=campaign&date_preset=today&fields=campaign_id,campaign_name,spend,actions&filtering=${filtering}&access_token=${encodeURIComponent(ACCESS_TOKEN)}`
  );
  const insightsData = await insightsResponse.json();
  if (!insightsResponse.ok || insightsData.error) {
    throw new FacebookApiError(insightsResponse, insightsData);
  }
  if (!Array.isArray(insightsData.data)) {
    throw new Error("Failed to fetch Facebook campaign insights");
  }

  const targetActions = new Set([
    "onsite_conversion.messaging_conversation_started_7d",
    "lead",
    "purchase",
    "omni_purchase",
  ]);
  const paused_campaigns = [];
  for (const camp of insightsData.data) {
    const spend = parseFloat(camp.spend);
    const results = (camp.actions || []).reduce(
      (total, action) => targetActions.has(action.action_type)
        ? total + (parseFloat(action.value) || 0) : total,
      0
    );
    if (spend >= SPEND_LIMIT && results === 0) {
      const pauseResponse = await fetch(
        `https://graph.facebook.com/v26.0/${camp.campaign_id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "PAUSED", access_token: ACCESS_TOKEN }),
        }
      );
      const pauseData = await pauseResponse.json();
        if (!pauseResponse.ok || pauseData.error) {
          throw new FacebookApiError(pauseResponse, pauseData);
        }
      if (pauseData.success === true) {
        paused_campaigns.push({
          id: camp.campaign_id,
          name: camp.campaign_name,
          spend,
          formatted_spend: `${Math.round(spend).toLocaleString("vi-VN")} đ`,
        });
      }
    }
  }
  return {
    status: "success",
    checked_at: new Date().toISOString(),
    paused_count: paused_campaigns.length,
    paused_campaigns,
  };
}

function rpcError(res, status, id, code, message) {
  return res.status(status).json({ jsonrpc: "2.0", id, error: { code, message } });
}

// Stateless Streamable HTTP: JSON POST responses, no standalone SSE stream.
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization, MCP-Protocol-Version, MCP-Session-Id");
  res.setHeader("Access-Control-Expose-Headers", "MCP-Protocol-Version");
  res.setHeader("Cache-Control", "no-store");

  // This endpoint deliberately permits any HTTP(S) origin and requires no auth.
  if (req.headers.origin !== undefined) {
    try {
      const origin = new URL(req.headers.origin);
      if (!["http:", "https:"].includes(origin.protocol) || origin.origin !== req.headers.origin) {
        throw new Error("Invalid origin");
      }
    } catch {
      return rpcError(res, 403, null, -32600, "Invalid Origin");
    }
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, GET, OPTIONS");
    return res.status(405).end();
  }

  const version = req.headers["mcp-protocol-version"];
  if (version && !PROTOCOL_VERSIONS.includes(version)) {
    return rpcError(res, 400, null, -32600, "Unsupported MCP-Protocol-Version");
  }
  const contentType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return rpcError(res, 415, null, -32600, "Content-Type must be application/json");
  }
  const accept = String(req.headers.accept || "");
  if (!accept.includes("application/json") && !accept.includes("*/*")) {
    return rpcError(res, 406, null, -32600, "Accept must include application/json");
  }

  let message;
  try {
    message = typeof req.body === "string" || Buffer.isBuffer(req.body)
      ? JSON.parse(req.body.toString()) : req.body;
  } catch {
    return rpcError(res, 400, null, -32700, "Parse error");
  }
  const object = message && typeof message === "object" && !Array.isArray(message);
  const hasId = object && Object.prototype.hasOwnProperty.call(message, "id");
  if (!object || message.jsonrpc !== "2.0" || typeof message.method !== "string" ||
      (hasId && typeof message.id !== "string" &&
        !(typeof message.id === "number" && Number.isFinite(message.id))) ||
      (message.params !== undefined &&
        (!message.params || typeof message.params !== "object" || Array.isArray(message.params)))) {
    return rpcError(res, 400, null, -32600, "Invalid Request");
  }

  // Notifications never receive a JSON-RPC response or execute a tool.
  if (!hasId) return res.status(202).end();
  const { id, method, params = {} } = message;
  const reply = (result) => res.status(200).json({ jsonrpc: "2.0", id, result });

  switch (method) {
    case "initialize": {
      if (typeof params.protocolVersion !== "string" ||
          !params.capabilities || typeof params.capabilities !== "object" ||
          Array.isArray(params.capabilities) ||
          !params.clientInfo || typeof params.clientInfo.name !== "string" ||
          typeof params.clientInfo.version !== "string") {
        return rpcError(res, 200, id, -32602, "Invalid initialize parameters");
      }
      const protocolVersion = PROTOCOL_VERSIONS.includes(params.protocolVersion)
        ? params.protocolVersion : PROTOCOL_VERSIONS[0];
      return reply({
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "fb-ads-agent", version: "1.0.0" },
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: [TOOL] });
    case "tools/call": {
      if (params.name !== TOOL_NAME) {
        return rpcError(res, 200, id, -32602, "Unknown tool");
      }
      if (params.arguments !== undefined &&
          (!params.arguments || typeof params.arguments !== "object" ||
           Array.isArray(params.arguments) || Object.keys(params.arguments).length > 0)) {
        return rpcError(res, 200, id, -32602, "Tool accepts only an empty arguments object");
      }
      try {
        const result = await checkFacebookAdsRules();
        return reply({ content: [{ type: "text", text: JSON.stringify(result) }] });
      } catch (error) {
        // Preserve Facebook API diagnostics; keep unexpected transport errors generic.
        const safeMessages = new Set([
          "Missing configuration: FB_AD_ACCOUNT_ID and FB_ACCESS_TOKEN are required",
          "Invalid configuration: SPEND_LIMIT must be a non-negative number",
          "Failed to fetch Facebook campaign insights",
        ]);
        const message = error instanceof FacebookApiError || safeMessages.has(error.message)
          ? error.message : "Failed to communicate with Facebook Graph API";
        return reply({
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: message, ...(error instanceof FacebookApiError ? { code: error.code, subcode: error.subcode } : {}) }) }],
        });
      }
    }
    default:
      return rpcError(res, 200, id, -32601, "Method not found");
  }
}
