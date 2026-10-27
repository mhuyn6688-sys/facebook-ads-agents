import { dashboard, TEXT_ROUTES, prompt, CREATE_PROMPT } from "../lib/ui.js";
import { telegramConfig, webhookSecret, telegramApi, ensureBotMenu } from "../lib/telegram.js";
import { optimize, snapshot, budget, duplicate, setAds, setStatus, setAdStatus, money, campaign,
  scanAds, resurrection, accountHealth, accountReport, accountReportText, parsePostId, vnd } from "../lib/facebook.js";
import { optimizationOutput, campaignCard, adCard, suggestionOutput, sendOutput } from "../lib/reports.js";
export const HELP = "🎛 DÙNG BOT BẰNG NÚT BẤM\nChọn bàn phím tiếng Việt phía dưới hoặc mở Menu → menu.\n• Danh sách Cam: Vít +20%, Bật/Tắt, Nhân bản, Đổi ngân sách.\n• Đổi ngân sách: bấm nút dưới Cam rồi nhập số tiền VND.\n• Lên Cam mới: bấm “Tạo Cam mới từ bài viết”, trả lời lần lượt link/ID bài, ngân sách và tên. Cam mới giữ PAUSED; bấm Bật khi sẵn sàng.\n• Trong phần nhập liệu, bấm nút chức năng khác để rời quy trình.\n\n/help hoặc /start — Hướng dẫn\n/check hoặc kiểm tra — Quét và tự tắt theo quy tắc\n/ds — Danh sách chiến dịch ACTIVE hôm nay\n/dexuat — Đề xuất CBO, nội dung và tệp\n/vit Campaign_ID — Tăng ngân sách CBO 20%\n/ngansach Campaign_ID Số_tiền_VND — Đặt ngân sách ngày\n/nhanban Campaign_ID [Ngân_sách_VND] — Sao chép CBO, để PAUSED\n/setads Post_ID Ngân_sách_VND Tên_chiến_dịch — Sao chép mẫu CBO mới nhất, đổi bài viết, để PAUSED\n/bat Campaign_ID — Bật chiến dịch\n/tat Campaign_ID — Tắt chiến dịch\n\nNhập số tiền VND nguyên, không dùng dấu phân cách.\nCắt lỗ: chi >=200.000 đ và 0 kết quả hoặc giá >=50.000 đ/kết quả.\nĐang rẻ: >=5 kết quả, giá <35.000 đ; đề xuất +20% hoặc nhân bản.\nKết quả ưu tiên tin nhắn; nếu thiếu dùng loại kết quả thay thế ghi trong /ds.\nChỉ hỗ trợ tài khoản VND.\n\nLỆNH NÂNG CAO\n/quetad — Quét Ad yếu trong chiến dịch CBO ACTIVE, bấm để tắt riêng Ad\n/hoisinh — Chiến dịch PAUSED có chi tiêu 3 ngày, bấm để bật lại\n/taikhoan — Sức khỏe tài khoản, Ad bị từ chối/có vấn đề\n/baocao — Tổng kết hôm nay và so sánh 7 ngày\n/setads URL_bài_viết Ngân_sách_VND Tên — Nhận link posts/videos/story_fbid/fbid hoặc ID số\nNút bấm: Vít +20%, Tắt/Bật, Nhân bản.\nBảo vệ công thần: >=15 kết quả và giá <35.000 đ trong 3 ngày; cảnh báo thay vì tự tắt.\nGiữ theo dõi không miễn quy tắc vĩnh viễn. Tổng kết tự động 00:10 giờ Việt Nam cho ngày vừa kết thúc.";
export async function command(text) {
  text = TEXT_ROUTES[String(text).trim().normalize("NFC")] || text;
  const words = text.trim().split(/\s+/);
  const name = words.shift().split("@")[0].toLowerCase();
  if (text.trim().toLocaleLowerCase("vi-VN") === "kiểm tra" || name === "/check")
    return optimizationOutput(await optimize());
  switch (name) {
    case "/menu": case "/start": return dashboard();
    case "/help": return { ...dashboard(), text: HELP };
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
        cards: campaigns.map(c => campaignCard(c)) };
    }
    case "/taikhoan": {
      const health = await accountHealth();
      const a = health.account;
      return { text: "SỨC KHỎE TÀI KHOẢN\n" +
        ["name", "account_status", "disable_reason", "amount_spent", "spend_cap", "balance", "currency"]
          .map(k => k + ": " + (a[k] ?? "Chưa có")).join("\n") +
        "\nNguồn thanh toán: " + (health.payment?.display || health.payment_error || "API chưa cung cấp") +
        "\nHạn mức chi tiêu (spend_cap) không phải ngưỡng thu tiền. API này không xác nhận thẻ còn sử dụng được." +
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
      return { text: "Đã nhân bản CBO, đang PAUSED.",
        cards: [campaignCard({ id, effective_status: "PAUSED" }, "Campaign_ID: " + id + "\nBấm Bật khi sẵn sàng.")] };
    }
    case "/setads": {
      if (words.length < 3) throw Error("Dùng /setads Post_ID Ngân_sách_VND Tên_chiến_dịch");
      const id = await setAds(words[0], words[1], words.slice(2).join(" "));
      return createdOutput(id);
    }
    case "/bat": case "/tat": {
      if (words.length !== 1) throw Error("Dùng " + name + " Campaign_ID");
      const c = await setStatus(words[0], name === "/bat" ? "ACTIVE" : "PAUSED");
      return "Đã " + (c.status === "ACTIVE" ? "bật" : "tắt") + " chiến dịch " + c.id;
    }
    default: return dashboard();
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
  const navigation = /^ui:(menu|check|ds|dexuat|baocao|quetad|hoisinh|taikhoan|help|setads)$/.exec(String(data || ""));
  if (navigation) return navigation[1] === "setads" ? prompt(CREATE_PROMPT) : command("/" + navigation[1]);
  const match = /^(vit|tat|bat|nhanban|tatad|keep|budget):(\d+)$/.exec(String(data || ""));
  if (!match) throw Error("Nút bấm không hợp lệ");
  const [, action, id] = match;
  if (action === "budget") {
    const c = await campaign(id, true);
    return prompt("💰 Đổi ngân sách CBO\nCampaign_ID: " + id + "\nNgân sách hiện tại: " +
      money(Number(c.daily_budget)) + "\nTrả lời tin này bằng số tiền VND mới, không có dấu phân cách.");
  }
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

function createdOutput(id) {
  return { text: "Đã tạo chiến dịch mới với bài viết mới, đang PAUSED.",
    cards: [campaignCard({ id, effective_status: "PAUSED" }, "Campaign_ID: " + id + "\nKiểm tra trước khi bấm Bật.")] };
}
export async function guidedReply(message) {
  const reply = message.reply_to_message;
  const botId = telegramConfig().token.split(":")[0];
  if (!reply?.from?.is_bot || String(reply.from.id) !== botId || reply.forward_origin) return null;
  const prior = String(reply.text || "");
  const age = Math.floor(Date.now() / 1000) - Number(reply.date);
  if (!Number.isFinite(age) || age < -60 || age > 1800) return null;
  const text = message.text.trim();
  const budgetId = prior.match(/^💰 Đổi ngân sách CBO\nCampaign_ID: (\d+)\n/);
  const post = prior.match(/\nBài viết: (\d+(?:_\d+)?)\n/);
  const amount = prior.match(/\nNgân sách VND: (\d+)\n/);
  try {
    if (budgetId) {
      const c = await budget(budgetId[1], vnd(text));
      return { text: "Đã đặt ngân sách CBO " + c.id + ": " + money(c.daily_budget),
        cards: [campaignCard({ id: c.id, effective_status: c.effective_status }, "Bạn có thể tiếp tục quản lý Cam " + c.id)] };
    }
    if (prior === CREATE_PROMPT) {
      const id = parsePostId(text);
      return prompt("🚀 Lên Cam mới — Bước 2/3\nBài viết: " + id +
        "\nTrả lời tin này bằng ngân sách ngày VND, không có dấu phân cách.");
    }
    if (prior.startsWith("🚀 Lên Cam mới — Bước 2/3\n") && post) {
      const value = vnd(text);
      return prompt("🚀 Lên Cam mới — Bước 3/3\nBài viết: " + post[1] +
        "\nNgân sách VND: " + value +
        "\nTrả lời tin này bằng tên chiến dịch mới. Chiến dịch sẽ được tạo PAUSED.");
    }
    if (prior.startsWith("🚀 Lên Cam mới — Bước 3/3\n") && post && amount) {
      if (!text || text.length > 120 || /[\r\n]/.test(text)) throw Error("Tên cần có 1–120 ký tự trên một dòng.");
      const id = await setAds(post[1], amount[1], text);
      return createdOutput(id);
    }
  } catch(e) {
    return { text: "Chưa hoàn tất: " + e.message, cards: prompt(prior).cards };
  }
  return null;
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
    const navigation = /^(ui:|budget:)/.test(callback.data);
    const key = "button:" + callback.message.message_id + ":" + callback.data;
    if (!navigation && !once(key)) return res.status(200).json({ ok: true });
    let output;
    try {
      if (!navigation) await telegramApi("editMessageReplyMarkup", {
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
  try {
    if (TEXT_ROUTES[message.text.trim().normalize("NFC")] || message.text.trim().startsWith("/"))
      output = await command(message.text);
    else output = await guidedReply(message) || await command(message.text);
  }
  catch(e) { output = "Không hoàn tất lệnh: " + e.message; }
  try { await sendOutput(output); }
  catch {
    console.error("Telegram reply delivery failed", update.update_id);
    return res.status(200).json({ ok: true, delivery_error: true });
  }
  return res.status(200).json({ ok: true });
}
