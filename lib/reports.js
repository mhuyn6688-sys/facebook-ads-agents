import { sendTelegram, campaignKeyboard, ensureBotMenu } from "./telegram.js";
import { money, listing, recommendations } from "./facebook.js";
export function adCard(a) {
  return { text: "AD CẦN XEM XÉT: " + a.name + " (" + a.id + ")\nChiến dịch: " + a.campaign_name +
    " (" + a.campaign_id + ")\nChi: " + money(a.spend) + "; " + a.messages + " kết quả\n" + a.reason +
    "\nTắt riêng Ad để dồn ngân sách CBO cho bài tốt.",
    markup: { inline_keyboard: [[{ text: "⏸ Tắt bài Ad này", callback_data: "tatad:" + a.id }]] } };
}
export function campaignCard(c, text, protectedCampaign = false) {
  return { text: text || listing([c]), markup: campaignKeyboard(c, protectedCampaign) };
}
export function optimizationOutput(r) {
  const cards = [
    ...r.paused_campaigns.map(c => campaignCard(c, "ĐÃ TẮT — " + c.reason + "\n" + listing([c]))),
    ...r.protected_campaigns.map(c => campaignCard(c, c.warning + "\n" + listing([c]) +
      "\n3 ngày: " + c.history_messages + " kết quả; giá " + money(c.history_cost_per_message) +
      "\nChưa tự tắt. Giữ theo dõi vẫn áp dụng lại quy tắc ở lần quét sau.", true)),
    ...r.winning_campaigns.map(c => campaignCard(c, "ĐANG RẺ — Đề xuất +20% CBO hoặc nhân bản\n" + listing([c]))),
    ...r.ad_recommendations.map(adCard),
  ];
  return { text: "BÁO CÁO CBO: đã kiểm tra " + r.checked_count + "; đã tắt " + r.paused_count +
    "; bảo vệ " + r.protected_campaigns.length + "; đang rẻ " + r.winning_campaigns.length +
    "; Ad cần xem xét " + r.ad_recommendations.length +
    (r.errors.length ? "\n" + r.errors.map(e => "Lỗi " + (e.id || e.scope) + ": " + e.error).join("\n") : ""),
    cards };
}
export async function sendOutput(output) {
  await ensureBotMenu().catch(() => {});
  if (typeof output === "string") return sendTelegram(output, false);
  if (output.text) await sendTelegram(output.text, false);
  for (const card of output.cards || []) await sendTelegram(card.text, false, card.markup);
}
export async function sendOptimizationReport(result) {
  return sendOutput(optimizationOutput(result));
}
export function suggestionOutput(campaigns, ads) {
  return { text: "ĐỀ XUẤT: " + campaigns.length + " chiến dịch ACTIVE; " + ads.length + " Ad cần xem xét.",
    cards: [...campaigns.map(c => campaignCard(c, listing([c]) + "\n" + recommendations([c]))), ...ads.map(adCard)] };
}
