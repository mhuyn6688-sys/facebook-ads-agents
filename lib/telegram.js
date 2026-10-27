import { COMMANDS, REPLY_KEYBOARD } from "./ui.js";
import { createHash } from "node:crypto";
export function telegramConfig() {
  return { token: (process.env.TELEGRAM_BOT_TOKEN || "9217503417:AAHUk0tia5SiewAKz9STexkX5jEeVppp_TI").replace(/\s+/g, ""),
    chatId: String(process.env.TELEGRAM_CHAT_ID || "7162906074").trim() };
}
export function webhookSecret() {
  return process.env.TELEGRAM_WEBHOOK_SECRET ||
    createHash("sha256").update(telegramConfig().token).digest("hex");
}
export async function sendTelegram(text, markdown = true, replyMarkup = REPLY_KEYBOARD) {
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
  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    await telegramApi("sendMessage", {
      chat_id: chatId, text: chunk, ...(markdown ? { parse_mode: "Markdown" } : {}),
      ...(replyMarkup && index === chunks.length - 1 ? { reply_markup: replyMarkup } : {}),
    });
  }
}

export async function telegramApi(method, body) {
  const { token } = telegramConfig();
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch("https://api.telegram.org/bot" + token + "/" + method, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (response.ok && data.ok) return data.result;
    const retry = Number(data.parameters?.retry_after);
    // Only retry a definitive rate-limit rejection, never an ambiguous mutation/delivery.
    if ((response.status === 429 || data.error_code === 429) && attempt < 2 && retry > 0 && retry <= 10) {
      await new Promise(resolve => setTimeout(resolve, retry * 1000));
      continue;
    }
    throw Error("Telegram " + method + " failed");
  }
}
export function campaignKeyboard(c, protectedCampaign = false) {
  const paused = c.effective_status === "PAUSED";
  const rows = [[
    { text: "🔥 Vít +20%", callback_data: "vit:" + c.id },
    { text: paused ? "▶️ Bật" : (protectedCampaign ? "⏸ Vẫn tắt" : "⏸ Tắt"),
      callback_data: (paused ? "bat:" : "tat:") + c.id },
    { text: "📋 Nhân bản", callback_data: "nhanban:" + c.id },
  ]];
  rows.push([{ text: "💰 Đổi ngân sách", callback_data: "budget:" + c.id }, { text: "🧭 Menu", callback_data: "ui:menu" }]);
  if (protectedCampaign) rows.push([{ text: "👀 Giữ theo dõi", callback_data: "keep:" + c.id }]);
  return { inline_keyboard: rows };
}

let menuRegisteredAt = 0;
let menuRegistration;
export async function ensureBotMenu(force = false) {
  if (!force && Date.now() - menuRegisteredAt < 3600000) return;
  if (menuRegistration) return menuRegistration;
  menuRegistration = (async () => {
    await telegramApi("setMyCommands", { commands: COMMANDS });
    await telegramApi("setChatMenuButton", { menu_button: { type: "commands" } });
    menuRegisteredAt = Date.now();
  })();
  try { await menuRegistration; } finally { menuRegistration = undefined; }
}
