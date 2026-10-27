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
  // Keep Vietnamese reports below Telegram's 4096-character message limit.
  const chunks = [];
  let current = "";
  for (const line of String(text).split("\n")) {
    if (current.length + line.length + 1 > 3500) { if (current) chunks.push(current); current = ""; }
    for (let i = 0; i < line.length; i += 3500) {
      const piece = line.slice(i, i + 3500);
      if (i + 3500 < line.length) { if (current) chunks.push(current); chunks.push(piece); current = ""; }
      else current += (current ? "\n" : "") + piece;
    }
  }
  if (current) chunks.push(current);
  for (const chunk of chunks) {
    const response = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: chunk, ...(markdown ? { parse_mode: "Markdown" } : {}) }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error("Telegram sendMessage failed");
  }
}
