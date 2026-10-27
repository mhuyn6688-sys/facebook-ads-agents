import { optimize, accountReport, accountReportText, FacebookApiError } from "../lib/facebook.js";
import { sendTelegram, ensureBotMenu } from "../lib/telegram.js";
import { sendOptimizationReport } from "../lib/reports.js";
export default async function handler(req, res) {
  if (process.env.AGENT_SECRET_KEY &&
      req.headers.authorization !== "Bearer " + process.env.AGENT_SECRET_KEY)
    return res.status(401).json({ error: "Unauthorized" });
  try {
    await ensureBotMenu().catch(() => {});
    if (req.query?.report === "daily") {
      const result = await accountReport("yesterday");
      await sendTelegram(accountReportText(result), false);
      return res.status(200).json({ status: "success", report: result, telegram: { sent: true } });
    }
    const result = await optimize();
    result.telegram = { sent: false };
    if (result.paused_count || result.winning_campaigns.length || result.protected_campaigns.length ||
        result.ad_recommendations.length || result.errors.length || req.query?.notify_all === "1") {
      try { await sendOptimizationReport(result); result.telegram.sent = true; }
      catch { result.telegram.error = "Telegram sendMessage failed"; }
    }
    return res.status(200).json(result);
  } catch (e) {
    return res.status(502).json({ error: e.message,
      ...(e instanceof FacebookApiError ? { code: e.code, subcode: e.subcode } : {}) });
  }
}
