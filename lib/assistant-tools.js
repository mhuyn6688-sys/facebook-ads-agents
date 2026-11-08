import { snapshot, resurrection, scanAds, accountHealth, accountReport, optimize,
  campaign, budget, setStatus, duplicate, setAds, parsePostId, vnd } from "./facebook.js";

export function normalize(text) {
  return String(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase();
}
const actionSchema = {
  type: "object", additionalProperties: false,
  properties: {
    operation: { type: "string", enum: ["increase_20", "set_budget", "pause", "activate", "duplicate", "create"] },
    campaign_id: { type: "string", description: "ID chính xác; phải đọc danh sách để phân giải tên trước." },
    amount_vnd: { type: "integer", minimum: 1 },
    post_id: { type: "string", description: "URL bài Facebook hoặc Post_ID cho create." },
    name: { type: "string", maxLength: 120 },
  }, required: ["operation"],
};
function tool(name, description, parameters) { return { type: "function", function: { name, description, parameters } }; }
export const AI_TOOLS = [
  tool("read_ads_data", "Đọc số liệu thật. Không thay đổi quảng cáo. Dùng query lọc tên/ID khi cần phân giải chiến dịch.", {
    type: "object", additionalProperties: false, properties: {
      source: {type:"string",enum:["campaigns","paused_campaigns","report","account_health","ads"]},
      query:{type:"string"}, date_preset:{type:"string",enum:["today","yesterday"]},
    }, required:["source"],
  }),
  tool("prepare_action", "Đề xuất một thay đổi cụ thể để người dùng có thể đồng ý ở tin sau. Chưa thực hiện. Dùng khi người dùng đang hỏi ý kiến hoặc thiếu yêu cầu thực hiện rõ ràng.", actionSchema),
  tool("perform_action", "Thực hiện thay đổi CHỈ khi người dùng đã yêu cầu rõ thao tác và đối tượng, hoặc đồng ý đề xuất cụ thể còn hiệu lực. Không dùng chỉ vì họ hỏi số liệu/đề xuất.", actionSchema),
  tool("apply_loss_cutting_rules", "Chạy quy tắc và tự PAUSE chiến dịch, có bảo vệ lịch sử. Chỉ dùng khi người dùng yêu cầu áp dụng quy tắc/tự tắt/cắt lỗ, không dùng để trả lời câu hỏi phân tích.", {
    type:"object",additionalProperties:false,properties:{},
  }),
];
function compact(c) {
  const {id,name,effective_status,daily_budget,spend,messages,result_type,cost_per_message,ctr,frequency,previous_cost_per_message} = c;
  return {id,name,effective_status,daily_budget,spend,messages,result_type,cost_per_message,ctr,frequency,previous_cost_per_message};
}
function parameters(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw Error("Tham số công cụ không hợp lệ");
  const valid = ["increase_20","set_budget","pause","activate","duplicate","create"];
  if (!valid.includes(args.operation)) throw Error("Thao tác không hỗ trợ");
  const a = { operation: args.operation };
  if (a.operation === "create") {
    a.post_id = parsePostId(args.post_id);
    a.amount_vnd = vnd(args.amount_vnd);
    if (typeof args.name !== "string" || !args.name.trim() || args.name.length > 120) throw Error("Thiếu tên chiến dịch hợp lệ");
    a.name = args.name.trim();
  } else {
    if (!/^\d+$/.test(String(args.campaign_id || ""))) throw Error("Cần Campaign_ID chính xác");
    a.campaign_id = String(args.campaign_id);
    if (a.operation === "set_budget" || args.amount_vnd !== undefined) a.amount_vnd = vnd(args.amount_vnd);
  }
  return a;
}
function amounts(text) {
  const values = [];
  const normalized = normalize(text);
  for (const m of normalized.matchAll(/(\d+(?:[.,]\d+)*)\s*(trieu|tr\b|nghin|ngan|k\b)?/g)) {
    const unit=m[2], number=unit ? Number(m[1].replace(",", ".")) : Number(m[1].replace(/[.,]/g,""));
    const value=number*(unit?.startsWith("tr")?1000000:unit?1000:1);
    if (Number.isSafeInteger(value)) values.push(value);
  }
  return values;
}
function explicitIntent(text, operation) {
  const t = normalize(text);
  if ((/\b(khong|chua)\b/.test(t) || /đừng/i.test(text)) || /co nen|tu van|danh gia|tai sao|vi sao|gia su|neu /.test(t)) return false;
  const patterns = {
    increase_20: /\b(tang|vit|nang)\b/,
    set_budget: /\b(doi|dat|chinh|tang|giam)\b.*\b(ngan sach|budget)\b/,
    pause: /\b(tat|dung|pause|ngung)\b/,
    activate: /\b(bat|chay lai|hoi sinh|active|kich hoat)\b/,
    duplicate: /\b(nhan ban|sao chep|copy)\b/,
    create: /\b(tao|len cam|len chien dich)\b/,
  };
  return patterns[operation].test(t);
}
export function createToolRunner({ state, userText, checkpoint, now = Date.now, api = {}, readOnly = false }) {
  const fb = { snapshot, resurrection, scanAds, accountHealth, accountReport, optimize,
    campaign, budget, setStatus, duplicate, setAds, ...api };
  let writes = 0;
  function accepted(a) {
    const p=state.proposal;
    return p && p.createdForUpdate !== state.current.updateId && p.expires > now() && JSON.stringify(p.action)===JSON.stringify(a) &&
      /^(dong y|ok|oke|lam di|thuc hien di|duyet|xac nhan)[.! ]*$/.test(normalize(userText).trim());
  }
  return async function run(name, args) {
    if (!args || typeof args !== "object" || Array.isArray(args)) throw Error("Tham số công cụ không hợp lệ");
    if (name === "read_ads_data") {
      if (args.source === "campaigns" || args.source === "paused_campaigns") {
        const all = args.source === "campaigns" ? await fb.snapshot({history:true}) : await fb.resurrection();
        const q=normalize(args.query || "").trim();
        const rows=all.filter(c=>!q||normalize(c.name).includes(q)||String(c.id)===q);
        state.knownCampaigns = [...new Map([...(state.knownCampaigns||[]),...all.map(compact)].map(c=>[c.id,c])).values()].slice(-80);
        state.focus=rows.map(c=>c.id);
        return {count:rows.length,campaigns:rows.slice(0,30).map(compact),truncated:rows.length>30};
      }
      if (args.source === "report") {
        if (args.date_preset && !["today","yesterday"].includes(args.date_preset)) throw Error("Khoảng thời gian không hợp lệ");
        return fb.accountReport(args.date_preset || "today");
      }
      if (args.source === "account_health") return fb.accountHealth();
      if (args.source === "ads") return (await fb.scanAds()).slice(0,30);
      throw Error("Nguồn dữ liệu không hỗ trợ");
    }
    if (name === "prepare_action" || name === "perform_action") {
      const a = parameters(args);
      const c = a.operation==="create" ? null : await fb.campaign(a.campaign_id, ["increase_20","set_budget","duplicate"].includes(a.operation));
      if (name === "prepare_action") {
        state.proposal={action:a,createdForUpdate:state.current.updateId,expires:now()+15*60000};
        await checkpoint();
        return {status:"proposed_only",action:a,campaign_name:c?.name,
          instruction:"Chưa thực hiện. Mô tả rõ thay đổi và chờ người dùng đồng ý."};
      }
      if (readOnly) throw Error("Tin chuyển tiếp chỉ được đọc/phân tích, không được thực hiện thay đổi.");
      const previous = state.current.actions.find(item=>JSON.stringify(item.action)===JSON.stringify(a));
      if (previous?.status==="completed") return {status:"executed",action:a,result:previous.result,reused:true};
      if (previous) throw Error("Kết quả thao tác trước chưa rõ. Không tự thử lại; cần kiểm tra trạng thái.");
      const consent=accepted(a);
      if (!consent && !explicitIntent(userText,a.operation)) throw Error("Người dùng chưa yêu cầu thực hiện rõ ràng; hãy giải thích hoặc hỏi lại, không tự thay đổi.");
      if (!consent && c) {
        const text=normalize(userText);
        const known=(state.knownCampaigns||[]).filter(k=>{
          const n=normalize(k.name);
          return text.includes(n)||n.split(/\s+/).some(w=>w.length>=3&&!["chien","dich","quang","cao","moi"].includes(w)&&text.split(/\s+/).includes(w));
        });
        const direct=new RegExp("\\b"+c.id+"\\b").test(text) ||
          (known.length===1&&String(known[0].id)===a.campaign_id) ||
          ((state.focus||[]).length===1&&state.focus[0]===a.campaign_id&&/\b(cam do|chien dich do|cam nay|no)\b/.test(text));
        if (!direct) throw Error("Chưa xác định duy nhất chiến dịch trong yêu cầu; cần hỏi lại tên hoặc ID.");
      }
      if (!consent && a.operation==="increase_20" && !/20\s*%|20\s*phan tram/.test(normalize(userText)))
        throw Error("Người dùng chưa nêu tăng 20%; hãy đề xuất mức cụ thể trước.");
      if (!consent && a.amount_vnd && !amounts(userText).includes(a.amount_vnd))
        throw Error("Ngân sách này chưa có trong yêu cầu hiện tại; cần hỏi lại hoặc đề xuất để người dùng đồng ý.");
      if (!consent && a.operation==="create" && !normalize(userText).includes(normalize(String(args.post_id))))
        throw Error("Chưa có bài viết rõ ràng trong yêu cầu; cần xác nhận đề xuất lên cam trước.");
      if (++writes>3) throw Error("Đã đạt giới hạn 3 thay đổi trong một lượt. Báo lại chính xác các thay đổi đã hoàn tất.");
      state.current.actions.push({action:a,status:"started"});
      await checkpoint(); // Persist before the side effect; never retry a mutation after an ambiguous failure.
      let result;
      if (a.operation==="increase_20") result=await fb.budget(a.campaign_id,undefined,true);
      if (a.operation==="set_budget") result=await fb.budget(a.campaign_id,a.amount_vnd);
      if (a.operation==="pause" || a.operation==="activate")
        result=await fb.setStatus(a.campaign_id,a.operation==="pause"?"PAUSED":"ACTIVE");
      if (a.operation==="duplicate") result={id:await fb.duplicate(a.campaign_id,a.amount_vnd),status:"PAUSED"};
      if (a.operation==="create") result={id:await fb.setAds(a.post_id,a.amount_vnd,a.name),status:"PAUSED"};
      state.current.actions.at(-1).status="completed";
      state.current.actions.at(-1).result=result;
      state.proposal=null;
      state.focus=[result.id||a.campaign_id].filter(Boolean);
      await checkpoint();
      return {status:"executed",action:a,result};
    }
    if (name === "apply_loss_cutting_rules") {
      if (readOnly || state.current.actions.some(a=>a.action.operation==="rules")) throw Error("Không được chạy lại quy tắc trong lượt này");
      const t=normalize(userText);
      if (!/(ap dung quy tac|chay quy tac|cat lo|tu tat)/.test(t)||/(khong|chua|dung)\b/.test(t))
        throw Error("Chỉ chạy quy tắc tự tắt khi người dùng yêu cầu áp dụng/cắt lỗ rõ ràng.");
      if (++writes>3) throw Error("Đã đạt giới hạn thao tác của lượt này");
      state.current.actions.push({action:{operation:"rules"},status:"started"});
      await checkpoint();
      const r=await fb.optimize();
      state.current.actions.at(-1).status="completed";
      state.current.actions.at(-1).result={paused_count:r.paused_count,ids:r.paused_campaigns.map(c=>c.id)};
      await checkpoint();
      return r;
    }
    throw Error("Công cụ không được phép");
  };
}
