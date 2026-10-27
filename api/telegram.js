import { telegramConfig, webhookSecret, sendTelegram } from "../lib/telegram.js";
import { optimize, report, snapshot, listing, recommendations, budget, duplicate, setAds, setStatus, money } from "../lib/facebook.js";
export const HELP = "/help hoặc /start — Hướng dẫn\n/check hoặc kiểm tra — Quét và tự tắt theo quy tắc\n/ds — Danh sách chiến dịch ACTIVE hôm nay\n/dexuat — Đề xuất CBO, nội dung và tệp\n/vit Campaign_ID — Tăng ngân sách CBO 20%\n/ngansach Campaign_ID Số_tiền_VND — Đặt ngân sách ngày\n/nhanban Campaign_ID [Ngân_sách_VND] — Sao chép CBO, để PAUSED\n/setads Post_ID Ngân_sách_VND Tên_chiến_dịch — Sao chép mẫu CBO mới nhất, đổi bài viết, để PAUSED\n/bat Campaign_ID — Bật chiến dịch\n/tat Campaign_ID — Tắt chiến dịch\n\nNhập số tiền VND nguyên, không dùng dấu phân cách.\nCắt lỗ: chi >=200.000 đ và 0 kết quả hoặc giá >=50.000 đ/kết quả.\nĐang rẻ: >=5 kết quả, giá <35.000 đ; đề xuất +20% hoặc nhân bản.\nKết quả ưu tiên tin nhắn; nếu thiếu dùng loại kết quả thay thế ghi trong /ds.\nChỉ hỗ trợ tài khoản VND.";
export async function command(text) {
  const words = text.trim().split(/\s+/);
  const name = words.shift().split("@")[0].toLowerCase();
  if (text.trim().toLocaleLowerCase("vi-VN") === "kiểm tra" || name === "/check")
    return report(await optimize());
  switch (name) {
    case "/help": case "/start": return HELP;
    case "/ds": return listing(await snapshot());
    case "/dexuat": return recommendations(await snapshot({ history: true }));
    case "/vit": {
      if (words.length !== 1) throw Error("Dùng /vit Campaign_ID");
      const c = await budget(words[0], undefined, true);
      return "Đã tăng 20% CBO: " + c.name + " (" + c.id + ")\n" +
        money(c.old_budget) + " → " + money(c.daily_budget);
    }
    case "/ngansach": {
      if (words.length !== 2) throw Error("Dùng /ngansach Campaign_ID Số_tiền_VND");
      const c = await budget(words[0], words[1]);
      return "Đã đặt ngân sách CBO " + c.id + ": " + money(c.daily_budget);
    }
    case "/nhanban": {
      if (words.length < 1 || words.length > 2) throw Error("Dùng /nhanban Campaign_ID [Ngân_sách_VND]");
      const id = await duplicate(words[0], words[1]);
      return "Đã nhân bản CBO, đang PAUSED.\nCampaign_ID: " + id + "\nBật khi sẵn sàng: /bat " + id;
    }
    case "/setads": {
      if (words.length < 3) throw Error("Dùng /setads Post_ID Ngân_sách_VND Tên_chiến_dịch");
      const id = await setAds(words[0], words[1], words.slice(2).join(" "));
      return "Đã tạo chiến dịch CBO mới với bài viết mới, đang PAUSED.\nCampaign_ID: " + id +
        "\nKiểm tra trước khi bật: /bat " + id;
    }
    case "/bat": case "/tat": {
      if (words.length !== 1) throw Error("Dùng " + name + " Campaign_ID");
      const c = await setStatus(words[0], name === "/bat" ? "ACTIVE" : "PAUSED");
      return "Đã " + (c.status === "ACTIVE" ? "bật" : "tắt") + " chiến dịch " + c.id;
    }
    default: return "Lệnh chưa được hỗ trợ. Gửi /help để xem hướng dẫn.";
  }
}
export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }
  if (req.headers["x-telegram-bot-api-secret-token"] !== webhookSecret())
    return res.status(401).json({ error: "Unauthorized" });
  let update;
  try { update = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: "Invalid JSON" }); }
  const message = update?.message;
  if (String(message?.chat?.id) !== telegramConfig().chatId || !message?.text)
    return res.status(200).json({ ok: true });
  let text;
  try { text = await command(message.text); }
  catch (e) { text = "Không hoàn tất lệnh: " + e.message; }
  try { await sendTelegram(text, false); }
  catch {
    // Acknowledge to avoid Telegram retrying an already completed budget/copy mutation.
    console.error("Telegram reply delivery failed for update", update.update_id);
    return res.status(200).json({ ok: true, delivery_error: true });
  }
  return res.status(200).json({ ok: true });
}
