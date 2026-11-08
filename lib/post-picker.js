import { randomBytes } from "node:crypto";
import { browsePosts } from "./facebook.js";
import { createConversationStore } from "./conversation-store.js";
import { telegramConfig } from "./telegram.js";
import { prompt, CREATE_PROMPT } from "./ui.js";
function defaultStore(){
  const c=telegramConfig();
  return createConversationStore(c.chatId,c.token.split(":")[0],"post-picker");
}
function link(post){
  try{const u=new URL(post.permalink_url);if(u.protocol==="https:"&&(u.hostname==="facebook.com"||u.hostname.endsWith(".facebook.com")))return u.href;}catch{}
  return "https://www.facebook.com/"+post.id;
}
export async function openPostPicker({store=defaultStore(),browse=browsePosts,after,templateId,now=Date.now}={}){
  const data=await browse({after,templateId});
  const loaded=await store.load();
  const nonce=randomBytes(5).toString("hex");
  const state={nonce,expires:now()+30*60000,...data};
  await store.save(state,loaded.etag);
  return {picker:{count:data.posts.length,page_id:data.page_id,template_id:data.template_id,page_read_available:!data.page_error},text:"📚 CHỌN BÀI ĐỂ LÊN CAM\nMẫu CBO: "+data.template_name+
    "\nPage: "+data.page_id+"\nChọn bài bằng nút dưới mỗi bài. Bấm chọn chưa tạo chiến dịch."+
    (data.page_error?"\nFacebook chưa cho đọc danh sách bài Page. Đang liệt kê các bài có trong quảng cáo mẫu.":"")+
    (!data.posts.length?"\nChưa tìm thấy bài có thể liệt kê với quyền hiện tại.":""),
    cards:[...data.posts.map((p,i)=>({
      text:"BÀI "+(i+1)+(p.created_time?" — "+new Date(p.created_time).toLocaleDateString("vi-VN"):"")+
        (p.template_name?"\nMẫu CBO: "+p.template_name:"")+"\n"+String(p.message||"Bài ảnh/video chưa có chú thích").slice(0,500)+
        (p.creative_id?"\nCó creative sẵn trong mẫu quảng cáo.":"\nFacebook sẽ kiểm tra khả năng dùng bài này khi tạo creative."),
      markup:{inline_keyboard:[[{text:"✅ Dùng bài này",callback_data:"pickpost:"+nonce+":"+i},
        {text:"🔗 Xem bài",url:link(p)}]]},
    })),{text:"Bạn có thể xem tiếp hoặc dùng link bài viết nếu muốn.",
      markup:{inline_keyboard:[
        ...(data.after?[[{text:"➡️ Xem thêm bài",callback_data:"postsnext:"+nonce}]]:[]),
        [{text:"🔄 Tải lại bài",callback_data:"ui:setads"},{text:"🔗 Nhập link thủ công",callback_data:"ui:setads_manual"}],
      ]},
    }]};
}
export async function selectPostCallback(value,{store=defaultStore(),browse=browsePosts,now=Date.now}={}){
  const match=/^(pickpost|postsnext):([a-f0-9]{10})(?::(\d+))?$/.exec(String(value));
  if(!match)throw Error("Nút chọn bài không hợp lệ");
  const loaded=await store.load(),s=loaded.state;
  if(s.nonce!==match[2]||s.expires<now())throw Error("Danh sách bài đã hết hạn hoặc được làm mới. Bấm Lên Cam để mở lại.");
  if(match[1]==="postsnext"){
    if(!s.after)throw Error("Không còn trang bài tiếp theo");
    return openPostPicker({store,browse,after:s.after,templateId:s.template_id,now});
  }
  if(match[3]===undefined)throw Error("Chưa xác định bài");
  const p=s.posts[Number(match[3])];
  if(!p||!/^\d+_\d+$/.test(p.id))throw Error("Bài được chọn không còn hợp lệ");
  return prompt("🚀 Lên Cam mới — Bước 2/3\nBài viết: "+p.id+
    "\nMẫu CBO: "+(p.template_id||s.template_id)+
    (p.creative_id?"\nMẫu creative: "+p.creative_id:"")+
    "\nTrả lời tin này bằng ngân sách ngày VND, không có dấu phân cách.");
}
export function manualPostEntry(){return prompt(CREATE_PROMPT);}
