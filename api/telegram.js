import { telegramConfig, webhookSecret, telegramApi } from "../lib/telegram.js";
import { optimize, snapshot, budget, duplicate, setAds, setStatus, setAdStatus, money, campaign,
  scanAds, resurrection, accountHealth, accountReport, accountReportText } from "../lib/facebook.js";
import { optimizationOutput, campaignCard, adCard, suggestionOutput, sendOutput } from "../lib/reports.js";
export const HELP = "/help hoặc /start — Hướng dẫn\n/check hoặc kiểm tra — Quét và tự tắt theo quy tắc\n/ds — Danh sách chiến dịch ACTIVE hôm nay\n/dexuat — Đề xuất CBO, nội dung và tệp\n/vit Campaign_ID — Tăng ngân sách CBO 20%\n/ngansach Campaign_ID Số_tiền_VND — Đặt ngân sách ngày\n/nhanban Campaign_ID [Ngân_sách_VND] — Sao chép CBO, để PAUSED\n/setads Post_ID Ngân_sách_VND Tên_chiến_dịch — Sao chép mẫu CBO mới nhất, đổi bài viết, để PAUSED\n/bat Campaign_ID — Bật chiến dịch\n/tat Campaign_ID — Tắt chiến dịch\n\nNhập số tiền VND nguyên, không dùng dấu phân cách.\nCắt lỗ: chi >=200.000 đ và 0 kết quả hoặc giá >=50.000 đ/kết quả.\nĐang rẻ: >=5 kết quả, giá <35.000 đ; đề xuất +20% hoặc nhân bản.\nKết quả ưu tiên tin nhắn; nếu thiếu dùng loại kết quả thay thế ghi trong /ds.\nChỉ hỗ trợ tài khoản VND.\n\nLỆNH NÂNG CAO\n/quetad — Quét Ad yếu trong chiến dịch CBO ACTIVE, bấm để tắt riêng Ad\n/hoisinh — Chiến dịch PAUSED có chi tiêu 3 ngày, bấm để bật lại\n/taikhoan — Sức khỏe tài khoản, Ad bị từ chối/có vấn đề\n/baocao — Tổng kết hôm nay và so sánh 7 ngày\n/setads URL_bài_viết Ngân_sách_VND Tên — Nhận link posts/videos/story_fbid/fbid hoặc ID số\nNút bấm: Vít +20%, Tắt/Bật, Nhân bản.\nBảo vệ công thần: >=15 kết quả và giá <35.000 đ trong 3 ngày; cảnh báo thay vì tự tắt.\nGiữ theo dõi không miễn quy tắc vĩnh viễn. Tổng kết tự động 00:10 giờ Việt Nam cho ngày vừa kết thúc.";
export async function command(text) {
  const words = text.trim().split(/\s+/);
  const name = words.shift().split("@")[0].toLowerCase();
  if (text.trim().toLocaleLowerCase("vi-VN") === "kiểm tra" || name === "/check")
    return optimizationOutput(await optimize());
  switch (name) {
    case "/help": case "/start": return HELP;
    case "/ds": {
      const campaigns = await snapshot();
      return { text: campaigns.length ? "CHIẾN DỊCH ACTIVE HÔM NAY" : "Không có chiến dịch ACTIVE.",
        cards: campaigns.map(c => campaignCard(c)) };
    }
    case "/dexuat": {
      const campaigns = await snapshot({ history: true });
      return suggestionOutput(campaigns, await scanAds(campaigns));
    }
    case "/quetad": {
      const ads = await scanAds();
      return { text: ads.length ? "AD CẦN XEM XÉT — chưa tự tắt" : "Không có Ad cần tắt theo ngưỡng.",
        cards: ads.map(adCard) };
    }
    case "/hoisinh": {
      const campaigns = await resurrection();
      return { text: campaigns.length ? "HỒI SINH — PAUSED, có chi tiêu trong 3 ngày" : "Không có chiến dịch PAUSED có chi tiêu 3 ngày.",
        cards: campaigns.map(c => ({ ...campaignCard(c),
          markup: { inline_keyboard: [[{ text: "▶️ Bật lại", callback_data: "bat:" + c.id }]] } })) };
    }
    case "/taikhoan": {
      const health = await accountHealth();
      const a = health.account;
      return { text: "SỨC KHỎE TÀI KHOẢN\n" +
        ["name", "account_status", "disable_reason", "amount_spent", "spend_cap", "balance", "currency"]
          .map(k => k + ": " + (a[k] ?? "Chưa có")).join("\n") +
        "\nSố tiền dùng đơn vị API của tài khoản. Ad bị từ chối/có vấn đề: " + health.problem_ads.length,
        cards: health.problem_ads.map(ad => ({ text: ad.name + " (" + ad.id + ") — " + ad.effective_status +
          "\nChiến dịch: " + ad.campaign_id + "\nChi tiết: " + JSON.stringify(ad.issues_info || ad.ad_review_feedback || {}) })) };
    }
    case "/baocao": return accountReportText(await accountReport());
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

// Best-effort duplicate suppression within a warm invocation; not durable storage.
const seen = new Map();
function once(key) {
  const now = Date.now();
  for (const [k,t] of seen) if (now - t > 3600000) seen.delete(k);
  if (seen.has(key)) return false;
  seen.set(key, now);
  if (seen.size > 2000) seen.delete(seen.keys().next().value);
  return true;
}
export async function callbackAction(data) {
  const match = /^(vit|tat|bat|nhanban|tatad|keep):(\d+)$/.exec(String(data || ""));
  if (!match) throw Error("Nút bấm không hợp lệ");
  const [, action, id] = match;
  if (action === "keep") {
    await campaign(id);
    return "Giữ theo dõi chiến dịch " + id + ". Chưa thay đổi trạng thái; lần quét sau vẫn áp dụng quy tắc và bảo vệ 3 ngày.";
  }
  if (action === "tatad") {
    await setAdStatus(id);
    return "Đã tắt riêng Ad " + id + ". Chiến dịch và các Ad khác giữ nguyên.";
  }
  return command("/" + action + " " + id);
}
export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }
  if (req.headers["x-telegram-bot-api-secret-token"] !== webhookSecret())
    return res.status(401).json({ error: "Unauthorized" });
  let update;
  try { update = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: "Invalid JSON" }); }
  const callback = update?.callback_query;
  const chatId = telegramConfig().chatId;
  if (callback) {
    const allowed = String(callback.message?.chat?.id) === chatId &&
      (chatId.startsWith("-") ? String(callback.from?.id) === String(process.env.TELEGRAM_USER_ID || "") :
        String(callback.from?.id) === chatId);
    try {
      await telegramApi("answerCallbackQuery", {
        callback_query_id: callback.id, text: allowed ? "Đang xử lý…" : "Bạn không có quyền dùng nút này.",
      });
    } catch { /* An expired callback answer must not expose bot credentials. */ }
    if (!allowed) return res.status(200).json({ ok: true });
    const key = "button:" + callback.message.message_id + ":" + callback.data;
    if (!once(key)) return res.status(200).json({ ok: true });
    let output;
    try {
      await telegramApi("editMessageReplyMarkup", {
        chat_id: chatId, message_id: callback.message.message_id, reply_markup: { inline_keyboard: [] },
      }).catch(() => {});
      output = await callbackAction(callback.data);
    } catch(e) { output = "Không hoàn tất thao tác: " + e.message; }
    try { await sendOutput(output); }
    catch { console.error("Telegram callback confirmation failed", update.update_id); }
    return res.status(200).json({ ok: true });
  }
  const message = update?.message;
  if (String(message?.chat?.id) !== chatId || !message?.text) return res.status(200).json({ ok: true });
  if (update.update_id !== undefined && !once("update:" + update.update_id)) return res.status(200).json({ ok: true });
  let output;
  try { output = await command(message.text); }
  catch(e) { output = "Không hoàn tất lệnh: " + e.message; }
  try { await sendOutput(output); }
  catch {
    console.error("Telegram reply delivery failed", update.update_id);
    return res.status(200).json({ ok: true, delivery_error: true });
  }
  return res.status(200).json({ ok: true });
}
