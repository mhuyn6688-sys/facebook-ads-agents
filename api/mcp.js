import { sendOptimizationReport } from "../lib/reports.js";
import { optimize, FacebookApiError } from "../lib/facebook.js";
const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
const TOOL_NAME = "checkFacebookAdsRules";
const TOOL = {
  name: TOOL_NAME,
  description: "Kiểm tra CBO ACTIVE hôm nay, bảo vệ lịch sử 3 ngày và quét Ad yếu: tự tắt khi chi >=200.000 đ và 0 kết quả hoặc giá >=50.000 đ; đề xuất tăng CBO khi >=5 kết quả và giá <35.000 đ",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
};

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
        const result = await optimize();
        if (result.paused_count || result.protected_campaigns.length || result.winning_campaigns.length ||
            result.ad_recommendations.length || result.errors.length) {
          try { await sendOptimizationReport(result); result.telegram = { sent: true }; }
          catch { result.telegram = { sent: false, error: "Telegram sendMessage failed" }; }
        }
        return reply({ content: [{ type: "text", text: JSON.stringify(result) }] });
      } catch (error) {
        // Preserve Facebook API diagnostics; keep unexpected transport errors generic.
        const message = error.message;
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
