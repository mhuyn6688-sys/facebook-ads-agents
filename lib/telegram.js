import { createHash } from "node:crypto";
export function telegramConfig() {
  return { token: (process.env.TELEGRAM_BOT_TOKEN || "9217503417:AAHUk0tia5SiewAKz9STexkX5jEeVppp_TI").replace(/\s+/g, ""),
    chatId: String(process.env.TELEGRAM_CHAT_ID || "7162906074").trim() };
}
export function webhookSecret() {
  return process.env.TELEGRAM_WEBHOOK_SECRET ||
    createHash("sha256").update(telegramConfig().token).digest("hex");
}
export async function sendTelegram(text, markdown = true) {
  const { token, chatId } = telegramConfig();
  const response = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...(markdown ? { parse_mode: "Markdown" } : {}) }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error("Telegram sendMessage failed");
}
export function reportText(campaigns, limit) {
  if (campaigns.length > 1) return "Đã tự động tạm dừng thêm *" + campaigns.length +
    " chiến dịch*, đều *0 kết quả*, với chi tiêu cộng dồn:\n" +
    campaigns.map(c => "• *" + c.formatted_spend + "*").join("\n") +
    "\n\nXem chi tiết tại *Quy tắc → Lịch sử*.";
  if (campaigns.length === 1) return "Đã tự động tạm dừng thêm *1 chiến dịch*: chi tiêu cộng dồn *" +
    campaigns[0].formatted_spend + "*, *0 kết quả*.\n\nXem chi tiết tại *Quy tắc → Lịch sử*.";
  return "Đã kiểm tra quy tắc: Không có chiến dịch nào vượt ngưỡng chi tiêu " +
    Math.round(limit).toLocaleString("vi-VN") + " đ mà 0 kết quả.";
}
