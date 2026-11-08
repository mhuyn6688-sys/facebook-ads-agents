# Facebook Ads CBO Agent
Node.js ES modules, Vercel Serverless Functions, Meta Graph API v26.0.

## Configuration
FB_AD_ACCOUNT_ID, FB_ACCESS_TOKEN, optional AGENT_SECRET_KEY.
TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID override existing defaults.
Telegram webhook secret defaults to SHA-256 of normalized bot token, or TELEGRAM_WEBHOOK_SECRET.
Register setWebhook with allowed_updates ["message","callback_query"] and the matching secret_token.
For group chats set TELEGRAM_USER_ID to the authorized operator; private-chat callbacks require the configured chat owner.
GitHub Actions needs AGENT_SECRET_KEY equal to Vercel's value if endpoint authentication is enabled.
Budget commands and VND rules support VND accounts; no guessing of exchange rates from budget magnitudes.

## Commands
/help hoặc /start — Hướng dẫn
/check hoặc kiểm tra — Quét và tự tắt theo quy tắc
/ds — Danh sách chiến dịch ACTIVE hôm nay
/dexuat — Đề xuất CBO, nội dung và tệp
/vit Campaign_ID — Tăng ngân sách CBO 20%
/ngansach Campaign_ID Số_tiền_VND — Đặt ngân sách ngày
/nhanban Campaign_ID [Ngân_sách_VND] — Sao chép CBO, để PAUSED
/setads Post_ID Ngân_sách_VND Tên_chiến_dịch — Sao chép mẫu CBO mới nhất, đổi bài viết, để PAUSED
/bat Campaign_ID — Bật chiến dịch
/tat Campaign_ID — Tắt chiến dịch

Nhập số tiền VND nguyên, không dùng dấu phân cách.
Cắt lỗ: chi >=200.000 đ và 0 kết quả hoặc giá >=50.000 đ/kết quả.
Đang rẻ: >=5 kết quả, giá <35.000 đ; đề xuất +20% hoặc nhân bản.
Kết quả ưu tiên tin nhắn; nếu thiếu dùng loại kết quả thay thế ghi trong /ds.
Chỉ hỗ trợ tài khoản VND.

LỆNH NÂNG CAO
/quetad — Quét Ad yếu trong chiến dịch CBO ACTIVE, bấm để tắt riêng Ad
/hoisinh — Chiến dịch PAUSED có chi tiêu 3 ngày, bấm để bật lại
/taikhoan — Sức khỏe tài khoản, Ad bị từ chối/có vấn đề
/baocao — Tổng kết hôm nay và so sánh 7 ngày
/setads URL_bài_viết Ngân_sách_VND Tên — Nhận link posts/videos/story_fbid/fbid hoặc ID số
Nút bấm: Vít +20%, Tắt/Bật, Nhân bản.
Bảo vệ công thần: >=15 kết quả và giá <35.000 đ trong 3 ngày; cảnh báo thay vì tự tắt.
Giữ theo dõi không miễn quy tắc vĩnh viễn. Tổng kết tự động 00:10 giờ Việt Nam cho ngày vừa kết thúc.

## Rules and protection
Today: pause when spend >=200000 and zero results, or spend >=200000 and cost/result >=50000.
Before any pause, read campaign last_3d insights. At least 15 results and weighted cost/result <35000 protects the campaign, with a warning and explicit override/monitor buttons. History failure aborts automatic pauses.
Winners: at least 5 results and cost/result <35000, with a campaign daily budget; recommend +20%, do not auto-increase.
Ad scan: active CBO campaigns with at least two ACTIVE ads, one spending >=150000 and zero results or cost/result >=50000. Only propose; the Ad-specific button pauses that Ad after checking ownership.
The monitor button preserves state now; it does not exempt a campaign forever.
Counting prefers messaging_conversation_started_7d, then total_messaging_connection, then the first available lead/omni_purchase/purchase fallback without double counting.

## Reporting
/api/check-ads runs the shared rules and sends campaign-by-campaign inline keyboards.
/api/mcp retains the checkFacebookAdsRules tool, using the same history protection and Ad scan. MCP calls also send actionable Telegram reports.
/ds includes all ACTIVE campaigns, including those with zero delivery. /dexuat includes the Ad scan.
/hoisinh lists PAUSED campaigns with spend in last_3d and offers individual reactivation; it does not assume when or why a campaign was paused.
/taikhoan includes raw account API monetary fields and DISAPPROVED/WITH_ISSUES ads.
/baocao includes all campaign delivery today, including campaigns paused later. Weighted cost = total spend / total results. Seven-day comparisons use last_7d total spend/results and daily averages divided by 7.
The best campaign is the lowest cost/result with results; the worst prioritizes the highest-spend zero-result campaign, then the highest cost/result.
Facebook date presets follow the ad account timezone. /dexuat compares rising cost to yesterday.
Hourly cron: 0 * * * * UTC.
Completed-day report: 10 17 * * * UTC = 00:10 Asia/Ho_Chi_Minh the next day. Calls /api/check-ads?report=daily and reads yesterday, without running optimization again.
GitHub schedules may be delayed; public-repository schedules can be disabled after inactivity.

## Creating campaigns
/setads accepts numeric Post_ID, PageID_PostID, and standard Facebook posts/videos/story_fbid/fbid URLs with a numeric post identifier.
Opaque share/short/pfbid links are rejected with guidance to use the original numeric link; they are not guessed.
New campaigns remain PAUSED. Child ads/adsets are prepared ACTIVE under the paused parent so /bat starts the prepared campaign.
Partial creation failures return the paused campaign ID for review.

## Delivery and retries
Reports split long text and attach each campaign's keyboard to its own message.
Buttons validate webhook secret, chat and operator before mutating; acknowledge callback queries promptly.
Used keyboards are removed. Warm-instance duplicate suppression reduces repeat taps/updates but is not durable across Vercel instances; do not repeat an unconfirmed mutation.
Only definitive Telegram rate-limit rejections are retried. Delivery failure never automatically repeats a completed Facebook mutation.

## Verification
Run node tests/advanced.test.mjs. Tests replace fetch with fixtures; they do not call Facebook or Telegram.

## Button-first Telegram dashboard
The bot registers the fixed nine-command menu automatically, with a warm-instance one-hour cache and retry on subsequent invocations after failure. setChatMenuButton selects the commands menu.
Every ordinary response carries the persistent four-row Vietnamese ReplyKeyboardMarkup. Dashboard/campaign cards carry InlineKeyboardMarkup in separate messages because Telegram permits only one reply_markup type per message.
All eight Vietnamese labels route to the same handlers as the slash commands. /menu, /start, and unrecognized messages open the dashboard. Existing expert commands remain supported.
Every /ds, /dexuat, /check campaign card and /hoisinh entry has +20%, status and copy actions; campaign cards also include custom budget and Menu buttons.
Creation and custom budgets are guided by ForceReply prompts, without a server-memory session: reply to the bot's latest prompt with the requested value. The bot validates prompt authorship, ignores forwarded/expired prompts, and revalidates campaign ownership before writes. Prompts expire after 30 minutes. /menu or another navigation button leaves the current input flow.
The creation flow asks for the post URL/ID, VND daily budget and campaign name; the resulting PAUSED campaign has a direct Activate button. Text input remains necessary for user-supplied URLs, amounts and names, but command syntax is optional.
Account health requests funding_source_details separately; a missing permission does not suppress the rest of the health report. Only the display label/type are retained, not full payment details. spend_cap is an account spend limit, not a billing threshold; this API does not prove a card is valid or available.

Run both:
- node tests/advanced.test.mjs
- node tests/menu.test.mjs

## Natural-language assistant
Ordinary text now goes to a tool-calling language model instead of the fixed command/menu fallback. Explicit slash commands, eight Vietnamese shortcuts, callback buttons and guided forms still use the deterministic handlers.
Examples: "Hôm nay cam nào đang đắt?", "Vì sao mới tiêu ít mà chưa có tin nhắn?", "Đổi ngân sách Cam Alpha thành 300k", "Tắt Cam Alpha đi".
The assistant can explain data, discuss strategy, write copy, and use named tools to read or change campaigns. It has no arbitrary URL, shell or general Graph API tool.
Model: AI_GATEWAY_MODEL must be a tool-capable provider/model ID from the live AI Gateway catalog. Authentication uses the current invocation x-vercel-oidc-token header; AI_GATEWAY_API_KEY is an optional server-only override. Gateway may require payment verification or credits; code does not purchase credits or raise budgets.
A private Vercel Blob store connected to the project supplies BLOB_READ_WRITE_TOKEN (or Blob OIDC store binding). History is never public. Each bot/chat retains at most 10 text turns plus bounded campaign context and a short-lived explicit proposal.
Read/write state uses uncached reads and ETag-conditional writes. Update IDs and pre-effect action checkpoints reduce retries; ambiguous write failures are not automatically repeated. This is not a distributed transaction with Facebook. Do not repeat a timed-out write before checking its state.
Mutation guards require a current direct instruction with a uniquely identified target and specified budget/20% increment, or assent to a matching proposal from a prior turn within 15 minutes. Advice/questions/negations and forwarded messages do not authorize writes.
A single turn is bounded to 5 model steps and 3 campaign changes. A proposal does not execute anything. New/copy campaigns stay PAUSED.
api/telegram has a 300-second maximum duration. Telegram can send duplicate webhooks while a long request is still running; the conversation checkpoint suppresses re-execution.
Run node tests/assistant.test.mjs in addition to the previous test suites. Model, storage and mutation calls are injected/mocked in tests; live verification is separate.

## Free Gemini provider (production default)
AI_PROVIDER=gemini calls Google's Gemini Developer API directly, not Vercel AI Gateway. GEMINI_MODEL defaults to gemini-3.5-flash-lite, which supports function calling and has a free tier.
Create an API key in Google AI Studio using a project on the Free tier, without enabling Cloud Billing. Save it as a Secret named GEMINI_API_KEY for Production in Vercel, then redeploy. Never paste it into chat/source.
The same conversation memory and restricted Facebook tools are used. A 429 quota response stops the turn with a free-quota explanation. There is no automatic fallback to a paid provider and no code that purchases credits.
Google controls availability and free-tier limits, and free-tier data may be used to improve its products according to its terms. This is not an unlimited/free hosting guarantee; Vercel Functions and private Blob retain their own plan quotas.
AI_PROVIDER=vercel remains an explicit optional configuration only. Production is set to gemini.

## Pick a post without copying IDs
The primary Create Campaign button and /setads with no arguments now open a post picker. /baiviet and natural messages asking to view/select posts also open it.
The picker displays published posts from the Page tied to a valid recent CBO template, with excerpt, View Post and Use This Post buttons. It first uses the configured Facebook token; if needed it tries a matching Page token from me/accounts or FB_PAGE_ACCESS_TOKEN. Page tokens never leave server-side code.
If published-post access is unavailable, the picker lists reusable posts/creatives already present in that template's ads. It clearly labels that fallback instead of claiming to list all Page posts.
Selecting a post only opens the budget/name prompts. It does not copy or activate a campaign. The selected template and existing creative, where available, are carried through the bot-authored prompts and revalidated before writes.
Picker state has its own private Blob namespace, a random nonce, a 30-minute expiry and bounded batches; old buttons are rejected after refresh. Pagination uses only the server-returned cursor.
Manual links and existing /setads syntax remain available. New creative creation occurs before any campaign duplication. On a creative failure no campaign is copied; Meta's exact error and stage are reported without guessing the cause. Copied campaigns remain PAUSED.
Run node tests/post-picker.test.mjs alongside the existing regression suites.
