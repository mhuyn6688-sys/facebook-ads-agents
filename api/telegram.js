import checkAds from "./check-ads.js";
import { telegramConfig, webhookSecret, sendTelegram } from "../lib/telegram.js";
export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }
  if (req.headers["x-telegram-bot-api-secret-token"] !== webhookSecret())
    return res.status(401).json({ error: "Unauthorized" });
  let update;
  try { update = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: "Invalid JSON" }); }
  const message = update?.message;
  if (String(message?.chat?.id) !== telegramConfig().chatId)
    return res.status(200).json({ ok: true });
  const text = String(message?.text || "").trim().toLocaleLowerCase("vi-VN");
  if (!/^\/(start|check)(@[a-z0-9_]+)?(?:\s|$)/i.test(text) && text !== "kiểm tra")
    return res.status(200).json({ ok: true });
  let result;
  await checkAds({
    headers: { authorization: "Bearer " + process.env.AGENT_SECRET_KEY },
    query: { notify_all: "1" },
  }, {
    status() { return this; },
    json(body) { result = body; return this; },
  });
  if (result?.error) {
    try { await sendTelegram("Không thể kiểm tra Facebook Ads: " + result.error, false); }
    catch { return res.status(502).json({ ok: false, error: "Telegram sendMessage failed" }); }
  } else if (result?.telegram?.error) {
    return res.status(502).json({ ok: false, error: result.telegram.error });
  }
  return res.status(200).json({ ok: true });
}
