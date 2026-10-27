export const COMMANDS = [
  ["menu", "Mở bảng điều khiển tất cả chức năng"],
  ["check", "Quét quy tắc cắt lỗ & tối ưu ngay"],
  ["ds", "Xem danh sách chiến dịch & nút điều khiển"],
  ["dexuat", "Phân tích chỉ số & đề xuất tối ưu"],
  ["baocao", "Báo cáo tổng kết chi tiêu & tin nhắn"],
  ["quetad", "Quét các bài quảng cáo Ad đắt trong cam CBO"],
  ["hoisinh", "Xem & bật lại các chiến dịch đang tạm dừng"],
  ["taikhoan", "Kiểm tra sức khỏe tài khoản & thẻ thanh toán"],
  ["help", "Hướng dẫn đổi ngân sách cụ thể & lên cam mới"],
].map(([command, description]) => ({ command, description }));
export const KEYBOARD_ROWS = [
  ["🔍 Kiểm tra ngay", "📋 Danh sách Cam"],
  ["💡 Đề xuất tối ưu", "📊 Báo cáo ngày"],
  ["🧹 Quét bài Ad đắt", "♻️ Hồi sinh Cam"],
  ["🏥 Sức khỏe TK", "🚀 Lên Cam / Trợ giúp"],
];
export const REPLY_KEYBOARD = { keyboard: KEYBOARD_ROWS, resize_keyboard: true, is_persistent: true };
const routes = ["check", "ds", "dexuat", "baocao", "quetad", "hoisinh", "taikhoan", "help"];
export const TEXT_ROUTES = Object.fromEntries(KEYBOARD_ROWS.flat().map((label, i) => [label, "/" + routes[i]]));
export function dashboard() {
  return {
    text: "🎛 BẢNG ĐIỀU KHIỂN FACEBOOK ADS\nChọn chức năng bằng bàn phím bên dưới hoặc nút trong bảng. Đổi ngân sách bằng nút dưới từng chiến dịch; lên cam mới theo hướng dẫn từng bước.",
    cards: [{
      text: "Bạn muốn làm gì?",
      markup: { inline_keyboard: [
        ...KEYBOARD_ROWS.map((row, i) => row.map((text, j) => ({
          text, callback_data: "ui:" + routes[i * 2 + j],
        }))),
        [{ text: "🚀 Tạo Cam mới từ bài viết", callback_data: "ui:setads" },
         { text: "💰 Đổi ngân sách Cam", callback_data: "ui:ds" }],
      ] },
    }],
  };
}
export const FORCE_REPLY = { force_reply: true, selective: true, input_field_placeholder: "Nhập thông tin tại đây" };
export const CREATE_PROMPT = "🚀 Lên Cam mới — Bước 1/3\nTrả lời tin này bằng link bài viết Facebook hoặc Post_ID.";
export function prompt(text) { return { cards: [{ text, markup: FORCE_REPLY }] }; }
