const ROOT = "https://graph.facebook.com/v26.0";
export const money = n => Math.round(n).toLocaleString("vi-VN") + " đ";
export class FacebookApiError extends Error {
  constructor(response, data) {
    const e = data.error || {};
    const detail = [e.error_user_title, e.error_user_msg].filter(Boolean).join(": ");
    super((e.message || "Facebook HTTP " + response.status) + (detail ? " — " + detail : "") + " (code: " +
      (e.code ?? null) + ", subcode: " + (e.error_subcode ?? null) + ")");
    this.code = e.code ?? null; this.subcode = e.error_subcode ?? null;
  }
}
function config() {
  const id = "act_" + String(process.env.FB_AD_ACCOUNT_ID || "").replace(/\D+/g, "");
  const token = String(process.env.FB_ACCESS_TOKEN || "").replace(/\s+/g, "");
  if (id === "act_" || !token) throw Error("Thiếu FB_AD_ACCOUNT_ID hoặc FB_ACCESS_TOKEN");
  return { id, token };
}
export async function graph(path, params = {}, method = "GET", pageToken) {
  const token = pageToken || config().token;
  const url = new URL(ROOT + "/" + path);
  const options = { method, signal: AbortSignal.timeout(25000) };
  if (method === "GET") {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    options.headers = { Authorization: "Bearer " + token };
  } else {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify({ ...params, access_token: token });
  }
  let response, data;
  try { response = await fetch(url.toString(), options); data = await response.json(); }
  catch { throw Error("Không thể kết nối Facebook Graph API"); }
  if (!response.ok || data.error) {
    const error = new FacebookApiError(response, data);
    error.message = method + " " + path + ": " + error.message;
    throw error;
  }
  if (data.success === false) throw Error("Facebook chưa xác nhận thao tác");
  return data;
}
async function all(path, params = {}) {
  const rows = []; let after; const seen = new Set();
  do {
    const page = await graph(path, { ...params, limit: 100, ...(after ? { after } : {}) });
    if (!Array.isArray(page.data)) throw Error("Facebook trả danh sách không hợp lệ");
    rows.push(...page.data);
    after = page.paging?.next ? page.paging?.cursors?.after : undefined;
    if (after && seen.has(after)) throw Error("Facebook trả cursor phân trang lặp");
    if (after) seen.add(after);
  } while (after);
  return rows;
}
export function messagesFrom(actions = []) {
  for (const type of ["onsite_conversion.messaging_conversation_started_7d",
    "onsite_conversion.total_messaging_connection", "lead", "omni_purchase", "purchase"]) {
    const matches = actions.filter(a => a.action_type === type);
    if (matches.length) {
      const count = matches.reduce((sum, a) => sum + Number(a.value || 0), 0);
      if (!Number.isFinite(count) || count < 0) throw Error("Số kết quả Facebook không hợp lệ");
      return { messages: count, result_type: type };
    }
  }
  return { messages: 0, result_type: null };
}
export async function account() {
  const data = await graph(config().id, { fields: "id,currency" });
  // VND has no fractional minor unit: one API budget unit is one dong.
  // Never guess an exchange rate or multiply budgets from their magnitude.
  if (data.currency !== "VND") throw Error("Tài khoản phải dùng VND; không tự quy đổi ngoại tệ sang VND");
  return data;
}
export async function campaign(id, cbo = false) {
  if (!/^\d+$/.test(String(id || ""))) throw Error("Campaign_ID phải là chữ số");
  const c = await graph(id, { fields: "id,name,account_id,daily_budget,effective_status,created_time" });
  if (String(c.account_id) !== config().id.slice(4)) throw Error("Chiến dịch không thuộc tài khoản đã cấu hình");
  if (cbo && !(Number(c.daily_budget) > 0)) throw Error("Chiến dịch không có ngân sách ngày cấp CBO");
  return c;
}
export async function snapshot({ history = false } = {}) {
  await account();
  const campaigns = await all(config().id + "/campaigns", {
    fields: "id,name,daily_budget,effective_status,created_time",
    filtering: JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE"] }]),
  });
  const fields = "campaign_id,campaign_name,spend,impressions,clicks,ctr,cpm,frequency,actions,cost_per_action_type";
  const insights = await all(config().id + "/insights", { level: "campaign", date_preset: "today", fields });
  const previous = history ? await all(config().id + "/insights", { level: "campaign", date_preset: "yesterday", fields }) : [];
  const today = new Map(insights.map(c => [c.campaign_id, c]));
  const yesterday = new Map(previous.map(c => [c.campaign_id, c]));
  return campaigns.filter(c => c.effective_status === "ACTIVE").map(c => {
    const row = today.get(c.id) || {};
    const spend = Number(row.spend || 0);
    if (!Number.isFinite(spend) || spend < 0) throw Error("Chi tiêu Facebook không hợp lệ");
    const result = messagesFrom(row.actions);
    const prev = yesterday.get(c.id);
    const prevCount = prev ? messagesFrom(prev.actions).messages : 0;
    return {
      id: c.id, name: c.name, daily_budget: Number(c.daily_budget || 0),
      effective_status: c.effective_status, spend, formatted_spend: money(spend),
      ...result, cost_per_message: result.messages > 0 ? spend / result.messages : null,
      impressions: Number(row.impressions || 0), clicks: Number(row.clicks || 0),
      ctr: Number(row.ctr || 0), cpm: Number(row.cpm || 0), frequency: Number(row.frequency || 0),
      actions: row.actions || [], cost_per_action_type: row.cost_per_action_type || [],
      previous_cost_per_message: prevCount > 0 ? Number(prev.spend) / prevCount : null,
    };
  });
}
export function classify(c) {
  if (c.spend >= 200000 && c.messages === 0) return "0 kết quả";
  if (c.spend >= 200000 && c.messages > 0 && c.cost_per_message >= 50000)
    return "Giá đắt >= 50.000 đ/tin nhắn";
  return null;
}
export async function setStatus(id, status) {
  await campaign(id);
  const r = await graph(id, { status }, "POST");
  if (r.success !== true) throw Error("Facebook chưa xác nhận thay đổi trạng thái");
  return { id, status };
}
export async function optimize() {
  const campaigns = await snapshot();
  // Read history before any write; a failed history read must not bypass protection.
  const history = campaigns.some(classify) ? await campaignInsights("last_3d") : [];
  const past = new Map(history.map(c => [c.id, c]));
  const paused_campaigns = [], winning_campaigns = [], protected_campaigns = [], errors = [];
  for (const c of campaigns) {
    const reason = classify(c);
    if (reason) {
      const h = past.get(c.id);
      if (isHistoricalWinner(h)) {
        protected_campaigns.push({ ...c, reason,
          warning: "Chiến dịch công thần đang đắt cục bộ hôm nay",
          history_messages: h.messages, history_cost_per_message: h.cost_per_message });
        continue;
      }
      try { await setStatus(c.id, "PAUSED"); paused_campaigns.push({ ...c, effective_status: "PAUSED", reason }); }
      catch (e) { errors.push({ id: c.id, error: e.message }); }
    } else if (c.messages >= 5 && c.cost_per_message < 35000 && c.daily_budget > 0) {
      winning_campaigns.push({ ...c, suggested_daily_budget: Math.round(c.daily_budget * 1.2),
        recommendation: "Tăng 20% ngân sách CBO hoặc nhân bản" });
    }
  }
  let ad_recommendations = [];
  try { ad_recommendations = await scanAds(campaigns.filter(c => !paused_campaigns.some(p => p.id === c.id))); }
  catch(e) { errors.push({ scope: "ads", error: e.message }); }
  return { status: errors.length ? "partial" : "success", checked_at: new Date().toISOString(),
    checked_count: campaigns.length, paused_count: paused_campaigns.length,
    paused_campaigns, winning_campaigns, protected_campaigns, ad_recommendations, errors };
}
export async function budget(id, amount, increase = false) {
  await account();
  const c = await campaign(id, true);
  const value = vnd(increase ? Math.round(Number(c.daily_budget) * 1.2) : amount);
  const r = await graph(id, { daily_budget: value }, "POST");
  if (!r.success) throw Error("Facebook chưa xác nhận ngân sách");
  return { id, name: c.name, effective_status: c.effective_status, old_budget: Number(c.daily_budget), daily_budget: value };
}
export function vnd(value) {
  if (!/^\d+$/.test(String(value || "")) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0)
    throw Error("Ngân sách VND phải là số nguyên dương, không có dấu phân cách");
  return Number(value);
}
async function readyChildren(id) {
  const adsets = await all(id + "/adsets", { fields: "id" });
  const ads = await all(id + "/ads", { fields: "id" });
  for (const a of adsets) await graph(a.id, { status: "ACTIVE" }, "POST");
  for (const a of ads) await graph(a.id, { status: "ACTIVE" }, "POST");
}
export async function duplicate(id, amount, { prepare = true, resumeId, replacementCreativeId } = {}) {
  await account(); await campaign(id, true);
  const value = amount === undefined ? undefined : vnd(amount);
  if (resumeId || replacementCreativeId) return copyIndividually(id, value, prepare, resumeId, replacementCreativeId);
  let copied;
  try {
    copied = await graph(id + "/copies", { deep_copy: true, status_option: "PAUSED" }, "POST");
  } catch (e) {
    // Meta rejects synchronous deep copies that contain too many child objects.
    // Only this explicit rejection permits another copy strategy; never retry timeouts.
    if (!(e instanceof FacebookApiError) || Number(e.subcode) !== 1885194) throw e;
    return copyIndividually(id, value, prepare);
  }
  const newId = copied.copied_campaign_id;
  if (!newId) throw Error("Facebook chưa trả copied_campaign_id; không tự thử lại");
  try {
    if (value !== undefined) await budget(newId, value);
    if (prepare) await readyChildren(newId);
    return String(newId);
  } catch (e) { throw Error("Bản sao " + newId + " vẫn PAUSED; chưa hoàn tất: " + e.message); }
}
async function copyIndividually(id, value, prepare, resumeId, replacementCreativeId) {
  // Snapshot structure before writing, then copy one object per request.
  const sets = await all(id + "/adsets", { fields: "id" });
  const ads = await all(id + "/ads", { fields: "id,adset_id,name,tracking_specs" });
  if (!sets.length || !ads.length || ads.some(a => !sets.some(s => String(s.id) === String(a.adset_id))))
    throw Error("Mẫu không có cấu trúc nhóm/quảng cáo đầy đủ để sao chép");
  let newId = resumeId, existingSets = [];
  if (newId) {
    const existing = await campaign(newId,true);
    existingSets = await all(newId+"/adsets",{fields:"id"});
    if (String(newId) === String(id) || existing.effective_status !== "PAUSED" ||
        (await all(newId+"/ads",{fields:"id"})).length || (!replacementCreativeId && existingSets.length))
      throw Error("Chỉ tiếp tục bản tạo dở PAUSED chưa có quảng cáo; không tự tạo bản trùng");
    if(existingSets.length && existingSets.length!==sets.length)
      throw Error("Bản tạo dở có cấu trúc nhóm chưa đầy đủ; không tự đoán hoặc sao chép trùng");
  } else {
    const copied = await graph(id + "/copies", { deep_copy: false, status_option: "PAUSED" }, "POST");
    newId = copied.copied_campaign_id;
  }
  if (!newId) throw Error("Facebook chưa trả copied_campaign_id; không tự thử lại");
  try {
    if (value !== undefined) await budget(newId, value);
    for (const set of sets) {
      let copy;
      if(existingSets.length){
        const fields="name,optimization_goal,billing_event,targeting,promoted_object";
        const source=await graph(set.id,{fields});
        const matches=[];
        for(const item of existingSets){
          const candidate=await graph(item.id,{fields});
          if(stableJSON(candidate)===stableJSON(source))matches.push(item);
        }
        if(matches.length!==1)throw Error("Không khớp duy nhất nhóm tạo dở với mẫu; chưa tạo thêm quảng cáo");
        copy={copied_adset_id:matches[0].id};
        existingSets=existingSets.filter(item=>item.id!==matches[0].id);
      }else copy = await copyAdset(set.id, String(newId));
      if (!copy.copied_adset_id) throw Error("Facebook chưa trả copied_adset_id");
      for (const ad of ads.filter(a => String(a.adset_id) === String(set.id))) {
        if(replacementCreativeId){
          const item=await graph(config().id+"/ads",{
            name:ad.name||"Quảng cáo bài đã chọn",adset_id:String(copy.copied_adset_id),
            creative:{creative_id:String(replacementCreativeId)},status:"PAUSED",
            ...(ad.tracking_specs?{tracking_specs:ad.tracking_specs}:{}),
          },"POST");
          if(!item.id)throw Error("Facebook chưa trả ID quảng cáo mới");
        }else{
          const item = await graph(ad.id + "/copies", {
            adset_id: String(copy.copied_adset_id), status_option: "PAUSED",
          }, "POST");
          if (!item.copied_ad_id) throw Error("Facebook chưa trả copied_ad_id");
        }
      }
    }
    if (prepare) await readyChildren(newId);
    return String(newId);
  } catch (e) {
    const error = new Error("Bản sao " + newId + " vẫn PAUSED; dừng để tránh tạo trùng. Chi tiết: " + e.message);
    error.partial_campaign_id=String(newId);
    throw error;
  }
}

function stableJSON(value, depth=0) {
  if(depth===0 && value?.targeting?.targeting_automation){
    value=structuredClone(value);
    // Meta omits this UI hint when reading newly created Advantage+ groups.
    delete value.targeting.targeting_automation.individual_setting;
  }
  // IDs differ between a copied group and its source; compare their configuration.
  if(Array.isArray(value))return JSON.stringify(value.map(v=>JSON.parse(stableJSON(v,depth+1))));
  if(value && typeof value==="object")return JSON.stringify(Object.fromEntries(
    Object.keys(value).filter(k=>depth>0||k!=="id").sort().map(k=>[k,JSON.parse(stableJSON(value[k],depth+1))])));
  return JSON.stringify(value);
}

async function copyAdset(id, campaignId) {
  try {
    return await graph(id+"/copies", {campaign_id:campaignId,deep_copy:false,status_option:"PAUSED"}, "POST");
  } catch(e) {
    if (!(e instanceof FacebookApiError) || Number(e.subcode)!==1885501) throw e;
    // /copies cannot override attribution_spec. Rebuild the same targeting/goal
    // only for Meta's explicit attribution rejection; no changes to the source.
    const fields=["name","optimization_goal","billing_event","targeting","promoted_object",
      "destination_type","bid_amount","bid_strategy","is_dynamic_creative",
      "optimization_sub_event","frequency_control_specs","pacing_type","dsa_beneficiary","dsa_payor"];
    const source=await graph(id,{fields:fields.join(",")});
    const params={campaign_id:campaignId,status:"PAUSED",
      attribution_spec:[{event_type:"CLICK_THROUGH",window_days:1}]};
    for(const key of fields) if(source[key]!==undefined&&source[key]!==null&&source[key]!=="")
      params[key]=source[key];
    if(!Number(params.bid_amount))delete params.bid_amount;
    if(!params.targeting||!params.optimization_goal||!params.billing_event)
      throw Error("Không đọc đủ cấu hình nhóm mẫu; chưa tạo nhóm thay thế");
    const created=await graph(config().id+"/adsets",params,"POST");
    if(!created.id)throw Error("Facebook chưa trả ID nhóm thay thế");
    return {copied_adset_id:String(created.id)};
  }
}

export async function creationTemplate(id) {
  let candidates;
  if(id) candidates=[await campaign(id,true)];
  else candidates=(await all(config().id+"/campaigns",{
    fields:"id,name,daily_budget,created_time,effective_status",
  })).filter(c=>Number(c.daily_budget)>0&&!["DELETED","ARCHIVED"].includes(c.effective_status))
    .sort((a,b)=>String(b.created_time).localeCompare(String(a.created_time))).slice(0,10);
  for(const template of candidates){
    const sourceAds=await all(template.id+"/ads",{
      fields:"id,name,creative{id,name,body,title,object_story_id,effective_object_story_id,object_story_spec,call_to_action}",
    });
    const pages=new Set(sourceAds.map(a=>{
      const c=a.creative||{};
      return c.object_story_spec?.page_id || (c.object_story_id||c.effective_object_story_id||"").split("_")[0];
    }).filter(p=>/^\d+$/.test(p)));
    if(pages.size===1) return {template,sourceAds,page:[...pages][0]};
    if(id) throw Error("Mẫu CBO không có quảng cáo với đúng một Page xác định");
  }
  throw Error("Không tìm được mẫu CBO có quảng cáo và Page hợp lệ");
}
async function publishedPosts(page, after) {
  const params={fields:"id,message,created_time,permalink_url",limit:6,...(after?{after}:{})};
  try { return await graph(page+"/published_posts",params); }
  catch(firstError){
    let token=process.env.FB_PAGE_ACCESS_TOKEN?.trim();
    if(!token){
      const pages=await all("me/accounts",{fields:"id,access_token"});
      token=pages.find(p=>String(p.id)===String(page))?.access_token;
    }
    if(!token) throw firstError;
    return graph(page+"/published_posts",params,"GET",token);
  }
}
export async function browsePosts({templateId,after}={}) {
  const {template,sourceAds,page}=await creationTemplate(templateId);
  let pageError, response;
  try { response=await publishedPosts(page,after); }
  catch(e) { pageError={message:e.message,code:e.code??null,subcode:e.subcode??null}; }
  const reusable=sourceAds.flatMap(ad=>{
    const c=ad.creative||{},id=c.object_story_id||c.effective_object_story_id;
    if(!c.id||!id||!new RegExp("^"+page+"_\\d+$").test(id))return [];
    return [{id,creative_id:String(c.id),message:c.body||c.title||ad.name||c.name||"Bài đang dùng trong mẫu CBO",
      permalink_url:"https://www.facebook.com/"+id,source:"template_ad"}];
  });
  if(pageError && !after) {
    // Also offer known posts from other CBO campaigns on the same Page.
    // Each item keeps its own compatible template; never mix Pages or ABO templates.
    try {
      const known=await graph(config().id+"/ads",{
        fields:"id,name,campaign_id,creative{id,body,title,object_story_id,effective_object_story_id}",
        limit:30,
      });
      const templates=new Map([[String(template.id),template]]);
      for(const ad of known.data||[]) {
        const c=ad.creative||{},story=c.object_story_id||c.effective_object_story_id;
        if(!c.id||!story||!new RegExp("^"+page+"_\\d+$").test(story)||!ad.campaign_id)continue;
        let owner=templates.get(String(ad.campaign_id));
        if(!owner){try{owner=await campaign(ad.campaign_id,true);templates.set(String(ad.campaign_id),owner);}catch{continue;}}
        if(["ARCHIVED","DELETED"].includes(owner.effective_status))continue;
        reusable.push({id:story,creative_id:String(c.id),template_id:String(owner.id),template_name:owner.name,
          message:c.body||c.title||ad.name||"Bài đã dùng trong quảng cáo CBO",permalink_url:"https://www.facebook.com/"+story,source:"template_ad"});
      }
    }catch{/* Existing template posts remain available when account-wide reads fail. */}
  }
  const pageRows=(response?.data||[]).filter(p=>new RegExp("^"+page+"_\\d+$").test(p.id)).map(p=>{
    const existing=reusable.find(r=>r.id===p.id);
    return {...p,source:"page_post",...(existing?{creative_id:existing.creative_id}:{})};
  });
  const posts=[...new Map([...pageRows,...(!after?reusable:[])].map(p=>[p.id,p])).values()].slice(0,10);
  return {template_id:String(template.id),template_name:template.name,page_id:page,posts,
    after:response?.paging?.next?response?.paging?.cursors?.after:null,
    page_error:pageError||null};
}
export async function setAds(postId, amount, name, selection={}) {
  postId=parsePostId(postId);vnd(amount);
  if(!name?.trim()||name.length>120)throw Error("Cần tên chiến dịch 1–120 ký tự");
  await account();
  const {template,sourceAds,page}=await creationTemplate(selection.templateId);
  if(postId.includes("_")&&postId.split("_")[0]!==page)throw Error("Bài viết không thuộc Page của mẫu CBO");
  const story=postId.includes("_")?postId:page+"_"+postId;
  let creativeId;
  if(selection.creativeId){
    const match=sourceAds.find(a=>String(a.creative?.id)===String(selection.creativeId)&&
      (a.creative.object_story_id||a.creative.effective_object_story_id)===story);
    if(!match)throw Error("Bài/creative không còn nằm trong mẫu đã chọn; hãy mở lại danh sách bài");
    creativeId=String(selection.creativeId);
  }else{
    // Validate/create the creative BEFORE copying a campaign, avoiding empty failed copies.
    try {
      const sets=await all(template.id+"/adsets",{fields:"id,optimization_goal,destination_type"});
      const inherited=sourceAds.map(a=>a.creative?.call_to_action||
        a.creative?.object_story_spec?.link_data?.call_to_action||
        a.creative?.object_story_spec?.video_data?.call_to_action).find(Boolean);
      const destinations=new Set(sets.filter(s=>s.optimization_goal==="CONVERSATIONS").map(s=>s.destination_type));
      let cta=inherited;
      if(destinations.has("MESSENGER"))cta={type:"MESSAGE_PAGE",value:{app_destination:"MESSENGER"}};
      if(destinations.size>1)throw Error("Mẫu có nhiều đích nhắn tin; cần chọn mẫu chỉ một đích để gắn đúng nút liên hệ");
      const creative=await graph(config().id+"/adcreatives",{
        name:name.trim(),object_story_id:story,...(cta?{call_to_action:cta}:{}),
      },"POST");
      if(!creative.id)throw Error("Facebook chưa trả ID creative");
      creativeId=creative.id;
    }catch(e){throw Error("Facebook từ chối bước tạo creative cho bài "+story+
      ". Chưa nhân bản chiến dịch. Chi tiết: "+e.message);}
  }
  const newId=await duplicate(template.id,amount,{prepare:false,resumeId:selection.resumeId,replacementCreativeId:creativeId});
  try{
    await graph(newId,{name:name.trim(),status:"PAUSED"},"POST");
    const ads=await all(newId+"/ads",{fields:"id"});
    if(!ads.length)throw Error("Bản sao không có quảng cáo");

    await readyChildren(newId);
    return newId;
  }catch(e){throw Error("Chiến dịch "+newId+" vẫn PAUSED; chưa hoàn tất bước gắn bài/quảng cáo: "+e.message);}
}
export function report(result) {
  const lines = ["BÁO CÁO QUY TẮC CBO", "Đã kiểm tra: " + result.checked_count + " chiến dịch."];
  for (const c of result.paused_campaigns) lines.push("ĐÃ TẮT: " + c.name + " (" + c.id + ") — " +
    c.reason + "; chi tiêu " + money(c.spend) + "; " + c.messages + " kết quả" +
    (c.cost_per_message !== null ? "; giá " + money(c.cost_per_message) : ""));
  if (!result.paused_count) lines.push("Không có chiến dịch cần tắt theo quy tắc.");
  for (const c of result.winning_campaigns) lines.push("ĐANG RẺ: " + c.name + " (" + c.id +
    ") — " + c.messages + " kết quả; " + money(c.cost_per_message) +
    "/kết quả. Đề xuất +20% CBO: " + money(c.suggested_daily_budget) + " hoặc nhân bản.");
  for (const e of result.errors) lines.push("LỖI " + e.id + ": " + e.error);
  return lines.join("\n");
}
export function listing(campaigns) {
  if (!campaigns.length) return "Không có chiến dịch ACTIVE.";
  return campaigns.map(c => c.name + "\nCampaign_ID: " + c.id +
    "\nNgân sách ngày CBO: " + (c.daily_budget ? money(c.daily_budget) : "Không có") +
    "\nChi tiêu hôm nay: " + money(c.spend) + "\nTin nhắn/kết quả: " + c.messages +
    "\nGiá/kết quả: " + (c.cost_per_message === null ? "Chưa có" : money(c.cost_per_message)) +
    "\nLoại kết quả: " + (c.result_type || "chưa có")).join("\n\n");
}
export function recommendations(campaigns) {
  if (!campaigns.length) return "Không có chiến dịch ACTIVE.";
  return campaigns.map(c => {
    const tips = [c.name + " (" + c.id + ")"];
    if (!c.messages) tips.push(c.spend >= 200000 ? "0 kết quả: nên tắt." : "Chưa có kết quả; theo dõi ngưỡng 200.000 đ.");
    else if (c.cost_per_message < 35000) tips.push("Giá <35.000 đ: " +
      (c.daily_budget > 0 ? "đề xuất +20% CBO hoặc nhân bản." + (c.messages < 5 ? " Ít dữ liệu (<5 kết quả): theo dõi thêm trước khi thực hiện." : "") : "cần cấu hình ngân sách CBO trước khi tăng."));
    else if (c.cost_per_message < 50000) tips.push("Ổn định: theo dõi thêm.");
    else tips.push("Cảnh báo giá >=50.000 đ; " + (c.spend >= 200000 ? "đã chạm ngưỡng cắt lỗ." : "chưa chạm ngưỡng chi tiêu cắt lỗ."));
    if (c.impressions > 0 && c.ctr < 1) tips.push("CTR <1%: làm lại nội dung/hình ảnh/3 giây đầu video.");
    if (c.frequency > 2.2 && c.cost_per_message !== null && c.previous_cost_per_message !== null &&
        c.cost_per_message > c.previous_cost_per_message)
      tips.push("Lặp tệp: frequency >2,2 và giá tăng so với hôm qua; nhân nhóm hoặc đổi tệp.");
    return tips.join("\n");
  }).join("\n\n");
}


export function parsePostId(input) {
  const raw = String(input || "").trim();
  if (/^\d+(?:_\d+)?$/.test(raw)) return raw;
  let url;
  try { url = new URL(raw); } catch { throw Error("Post_ID hoặc URL Facebook không hợp lệ"); }
  if (url.protocol !== "https:" || !(url.hostname === "facebook.com" || url.hostname.endsWith(".facebook.com")))
    throw Error("Chỉ nhận URL https://facebook.com");
  const post = url.searchParams.get("story_fbid") || url.searchParams.get("fbid") ||
    url.pathname.match(/\/(?:posts|videos)\/(\d+)(?:\/|$)/)?.[1];
  if (!post || !/^\d+(?:_\d+)?$/.test(post))
    throw Error("Không bóc được Post_ID số từ link; hãy dùng link bài gốc hoặc PageID_PostID");
  const page = url.searchParams.get("id") || url.pathname.match(/^\/(\d+)\/(?:posts|videos)\//)?.[1];
  return page && /^\d+$/.test(page) && !post.includes("_") ? page + "_" + post : post;
}
export async function campaignInsights(datePreset) {
  const rows = await all(config().id + "/insights", {
    level: "campaign", date_preset: datePreset,
    fields: "campaign_id,campaign_name,spend,actions,date_start,date_stop",
  });
  return rows.map(r => {
    const { messages, result_type } = messagesFrom(r.actions);
    const spend = Number(r.spend || 0);
    return { id: r.campaign_id, name: r.campaign_name, spend, messages, result_type,
      cost_per_message: messages > 0 ? spend / messages : null,
      date_start: r.date_start, date_stop: r.date_stop };
  });
}
export async function scanAds(activeCampaigns) {
  const campaigns = activeCampaigns || await snapshot();
  const active = new Map(campaigns.filter(c => c.daily_budget > 0).map(c => [c.id, c]));
  if (!active.size) return [];
  const ads = await all(config().id + "/ads", {
    fields: "id,name,campaign_id,effective_status",
    filtering: JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE"] }]),
  });
  const live = ads.filter(a => active.has(a.campaign_id) && a.effective_status === "ACTIVE");
  const counts = new Map();
  for (const a of live) counts.set(a.campaign_id, (counts.get(a.campaign_id) || 0) + 1);
  const insights = await all(config().id + "/insights", {
    level: "ad", date_preset: "today", fields: "ad_id,ad_name,campaign_id,spend,actions",
  });
  const metrics = new Map(insights.map(a => [a.ad_id, a]));
  return live.flatMap(ad => {
    if (counts.get(ad.campaign_id) < 2) return [];
    const row = metrics.get(ad.id);
    if (!row) return [];
    const { messages, result_type } = messagesFrom(row.actions);
    const spend = Number(row.spend || 0);
    const price = messages > 0 ? spend / messages : null;
    if (spend < 150000 || (messages > 0 && price < 50000)) return [];
    return [{ id: ad.id, name: ad.name, campaign_id: ad.campaign_id,
      campaign_name: active.get(ad.campaign_id).name, spend, messages, result_type,
      cost_per_message: price, reason: messages === 0 ? "0 tin nhắn/kết quả" : "Giá >=50.000 đ/kết quả" }];
  });
}
export async function setAdStatus(id, status = "PAUSED") {
  if (!/^\d+$/.test(String(id))) throw Error("Ad_ID không hợp lệ");
  const ad = await graph(id, { fields: "id,account_id,campaign_id" });
  if (String(ad.account_id) !== config().id.slice(4)) throw Error("Ad không thuộc tài khoản đã cấu hình");
  await campaign(ad.campaign_id);
  const r = await graph(id, { status }, "POST");
  if (r.success !== true) throw Error("Facebook chưa xác nhận trạng thái Ad");
  return { id, status };
}
export async function resurrection() {
  await account();
  const paused = await all(config().id + "/campaigns", {
    fields: "id,name,daily_budget,effective_status",
    filtering: JSON.stringify([{ field: "effective_status", operator: "IN", value: ["PAUSED"] }]),
  });
  const history = new Map((await campaignInsights("last_3d")).map(c => [c.id, c]));
  return paused.filter(c => c.effective_status === "PAUSED" && history.get(c.id)?.spend > 0)
    .map(c => ({ ...history.get(c.id), daily_budget: Number(c.daily_budget || 0), effective_status: "PAUSED" }));
}
export async function accountHealth() {
  const info = await graph(config().id, {
    fields: "id,name,account_status,disable_reason,amount_spent,spend_cap,balance,currency",
  });
  const ads = await all(config().id + "/ads", {
    fields: "id,name,campaign_id,effective_status,issues_info,ad_review_feedback",
    filtering: JSON.stringify([{ field: "effective_status", operator: "IN", value: ["DISAPPROVED", "WITH_ISSUES"] }]),
  });
  let payment = null, payment_error = null;
  try {
    const extra = await graph(config().id, { fields: "funding_source_details" });
    const details = extra.funding_source_details;
    payment = details ? { display: details.display_string || "Đã cấu hình nguồn thanh toán",
      type: details.type ?? null } : null;
  } catch(e) { payment_error = "Không đọc được nguồn thanh toán với quyền hiện tại"; }
  return { account: info, payment, payment_error, problem_ads: ads.filter(a => ["DISAPPROVED", "WITH_ISSUES"].includes(a.effective_status)) };
}
export async function accountReport(datePreset = "today") {
  await account();
  const rows = await campaignInsights(datePreset);
  const week = await campaignInsights("last_7d");
  const total = data => data.reduce((t,c) => ({ spend: t.spend + c.spend, messages: t.messages + c.messages }), { spend: 0, messages: 0 });
  const today = total(rows), seven = total(week);
  const ranked = rows.filter(c => c.messages > 0).sort((a,b) => a.cost_per_message - b.cost_per_message);
  const zero = rows.filter(c => c.messages === 0 && c.spend > 0).sort((a,b) => b.spend - a.spend);
  return { date_preset: datePreset, date_start: rows[0]?.date_start || null,
    date_stop: rows[0]?.date_stop || null, ...today,
    cost_per_message: today.messages > 0 ? today.spend / today.messages : null,
    best_campaign: ranked[0] || null,
    worst_campaign: zero[0] || ranked.at(-1) || null,
    seven_days: { ...seven, average_daily_spend: seven.spend / 7, average_daily_messages: seven.messages / 7,
      cost_per_message: seven.messages > 0 ? seven.spend / seven.messages : null,
      date_start: week[0]?.date_start || null, date_stop: week[0]?.date_stop || null } };
}
export function accountReportText(r) {
  const price = n => n === null ? "Chưa có kết quả" : money(n);
  const change = (current, base) => base > 0 ? ((current / base - 1) * 100).toFixed(1) + "%" : "Chưa có nền so sánh";
  const cpm = r.cost_per_message;
  return ["TỔNG KẾT TÀI KHOẢN — " + (r.date_start || r.date_preset),
    "Chi tiêu: " + money(r.spend) + "; so TB/ngày 7 ngày: " + change(r.spend, r.seven_days.average_daily_spend),
    "Tin nhắn/kết quả: " + r.messages + "; so TB/ngày 7 ngày: " + change(r.messages, r.seven_days.average_daily_messages),
    "Giá TB/kết quả: " + price(cpm) + "; so giá gộp 7 ngày: " +
      (cpm === null ? "Chưa có kết quả" : change(cpm, r.seven_days.cost_per_message)),
    "TB/ngày 7 ngày: " + money(r.seven_days.average_daily_spend) + "; " +
      r.seven_days.average_daily_messages.toFixed(1) + " kết quả; giá gộp: " + price(r.seven_days.cost_per_message),
    "Hiệu quả nhất: " + (r.best_campaign ? r.best_campaign.name + " (" + r.best_campaign.id + ") — " + price(r.best_campaign.cost_per_message) : "Chưa có"),
    "Đắt nhất: " + (r.worst_campaign ? r.worst_campaign.name + " (" + r.worst_campaign.id + ") — " +
      (r.worst_campaign.messages ? price(r.worst_campaign.cost_per_message) : "0 kết quả, đã chi " + money(r.worst_campaign.spend)) : "Chưa có"),
    "Số liệu theo múi giờ tài khoản Facebook. Giá gộp = tổng chi / tổng kết quả; không lấy TB các giá.",
  ].join("\n");
}

export function isHistoricalWinner(h) {
  return Boolean(h && h.messages >= 15 && h.cost_per_message !== null && h.cost_per_message < 35000);
}
