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

export default async function handler(req, res) {
  if (
    process.env.AGENT_SECRET_KEY &&
    req.headers.authorization !== "Bearer " + process.env.AGENT_SECRET_KEY
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const rawAccountId = (process.env.FB_AD_ACCOUNT_ID || "").trim();
  const AD_ACCOUNT_ID = rawAccountId
    ? (rawAccountId.startsWith("act_") ? rawAccountId : "act_" + rawAccountId)
    : "";
  const ACCESS_TOKEN = (process.env.FB_ACCESS_TOKEN || "").replace(/\s+/g, "");
  const SPEND_LIMIT = Number(process.env.SPEND_LIMIT || 250000);

  if (!AD_ACCOUNT_ID || !ACCESS_TOKEN) {
    return res.status(500).json({
      error: "Missing configuration: FB_AD_ACCOUNT_ID and FB_ACCESS_TOKEN are required",
    });
  }

  try {
    const filtering = encodeURIComponent(JSON.stringify([
      {
        field: "campaign.effective_status",
        operator: "IN",
        value: ["ACTIVE"],
      },
    ]));
    const insightsResponse = await fetch(
      `https://graph.facebook.com/v26.0/${AD_ACCOUNT_ID}/insights?level=campaign&date_preset=today&fields=campaign_id,campaign_name,spend,actions&filtering=${filtering}&access_token=${encodeURIComponent(ACCESS_TOKEN)}`
    );
    const insightsData = await insightsResponse.json();

    if (!insightsResponse.ok || insightsData.error) {
      throw new FacebookApiError(insightsResponse, insightsData);
    }

    const targetActions = new Set([
      "onsite_conversion.messaging_conversation_started_7d",
      "lead",
      "purchase",
      "omni_purchase",
    ]);
    const paused_campaigns = [];

    for (const camp of insightsData.data || []) {
      const spend = parseFloat(camp.spend);
      const results = (camp.actions || []).reduce(
        (total, action) =>
          targetActions.has(action.action_type)
            ? total + (parseFloat(action.value) || 0)
            : total,
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

    return res.status(200).json({
      status: "success",
      checked_at: new Date().toISOString(),
      paused_count: paused_campaigns.length,
      paused_campaigns,
    });
  } catch (error) {
    if (error instanceof FacebookApiError) {
      return res.status(502).json({ error: error.message, code: error.code, subcode: error.subcode });
    }
    return res.status(502).json({ error: "Failed to communicate with Facebook Graph API" });
  }
}
