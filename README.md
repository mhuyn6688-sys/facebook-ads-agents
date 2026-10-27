# Facebook Ads CBO Agent

Node.js ES modules, Vercel functions, Meta Graph API v26.0.

## Configuration
- FB_AD_ACCOUNT_ID: digits or account label; non-digits are removed and act_ is added.
- FB_ACCESS_TOKEN: requires access to this ad account, campaign insights, ads management, Page and creatives.
- AGENT_SECRET_KEY: optional Bearer authentication for /api/check-ads. Add the same secret in GitHub Actions for the hourly job.
- TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID: environment overrides for the existing fallbacks.
- TELEGRAM_WEBHOOK_SECRET: optional; otherwise SHA-256 of the normalized bot token. Register the same secret_token with Telegram setWebhook.
- This implementation supports VND accounts. It does not guess currency conversion from the size of an existing budget. One VND budget API unit is one dong.

## Rules
The rules use today's campaign spend in the account timezone, with pagination:
1. Spend >=200000 and zero results: pause.
2. Spend >=200000 and cost/result >=50000: pause.
3. At least 5 results, cost/result <35000, and campaign daily budget: recommend +20% CBO or duplication. Recommendations do not change budgets.

Message counts prefer messaging_conversation_started_7d, then total_messaging_connection. If neither action exists, use the first available primary fallback (lead, omni_purchase, purchase). Do not add overlapping purchase/message counters. The result_type is included in JSON and /ds.

## Endpoints
- /api/check-ads: runs rules and sends plain-text Vietnamese Telegram reports for pauses, winners or errors. Add ?notify_all=1 for an empty report too.
- /api/mcp: existing stateless MCP transport and checkFacebookAdsRules tool use the same rule engine.
- /api/telegram: Telegram webhook, validates secret header and configured chat.
- GitHub Actions runs 0 * * * * and supports manual workflow_dispatch.

## Telegram commands
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

## Operational behavior
/ds and /dexuat do not mutate campaigns. Rising cost is compared with yesterday's cost/result; no trend is claimed without results on both days.
Budget/status commands verify campaign account ownership. /nhanban and /setads deep-copy campaigns with PAUSED status. Their child ads/adsets are prepared as ACTIVE under a PAUSED parent, so /bat can start the prepared campaign. /setads creates a new creative for the requested Page post and replaces creatives only on the copied ads.
If setup fails after copying, the error includes the new campaign ID and the campaign stays PAUSED for review. Expired tokens, permissions, unsupported creatives and Meta review restrictions are reported as API errors.
Long Telegram reports are split into messages. Telegram delivery failure does not rerun a completed mutation. Cross-invocation duplicate command suppression is not backed by persistent storage; do not resend a mutation command while it is still processing.
GitHub schedules can be delayed and public-repository schedules can be disabled after inactivity. This is not a guaranteed exact-time scheduler.
