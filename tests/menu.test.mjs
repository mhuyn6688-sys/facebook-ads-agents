import assert from "node:assert/strict";
import hook, {command, callbackAction, guidedReply} from "../api/telegram.js";
import {COMMANDS, KEYBOARD_ROWS, REPLY_KEYBOARD, dashboard, CREATE_PROMPT} from "../lib/ui.js";
import {ensureBotMenu, sendTelegram, webhookSecret} from "../lib/telegram.js";
import {sendOutput} from "../lib/reports.js";
process.env.FB_AD_ACCOUNT_ID="123";process.env.FB_ACCESS_TOKEN="token";
process.env.TELEGRAM_BOT_TOKEN="999:test";process.env.TELEGRAM_CHAT_ID="7162906074";
let telegram=[],writes=[],campaignStatus="ACTIVE";
globalThis.fetch=async(url,options={})=>{
 if(url.includes("api.telegram.org")){
  telegram.push({method:url.split("/").at(-1),body:JSON.parse(options.body)});
  return {ok:true,json:async()=>({ok:true,result:true})};
 }
 const u=new URL(url),path=u.pathname.replace("/v26.0/","");let data;
 if(options.method==="POST"){
  const body=JSON.parse(options.body);writes.push({path,body});
  data=path.endsWith("/copies")?{copied_campaign_id:"99"}:path==="act_123/adcreatives"?{id:"777"}:{success:true};
 }else if(path==="act_123")data={currency:"VND",name:"Test",account_status:1,
  funding_source_details:{display_string:"Visa •••• 1234",type:1}};
 else if(path==="act_123/campaigns"){
  const paused=u.searchParams.get("filtering")?.includes("PAUSED");
  data={data:[{id:paused?"2":"1",name:"Test",daily_budget:"300000",effective_status:paused?"PAUSED":"ACTIVE",created_time:"2026-10-28"}]};
 }else if(path==="act_123/insights"){
  data={data:u.searchParams.get("level")==="ad"?[]:
   [{campaign_id:"1",campaign_name:"Test",spend:"100000",actions:[{action_type:"onsite_conversion.messaging_conversation_started_7d",value:"5"}]},
    {campaign_id:"2",campaign_name:"Paused",spend:"100000",actions:[]}]};
 }else if(path==="act_123/ads")data={data:[]};
 else if(path==="1/ads")data={data:[{id:"10",creative:{object_story_id:"888_111"}}]};
 else if(path==="99/ads")data={data:[{id:"991"}]};
 else if(path==="99/adsets")data={data:[{id:"992"}]};
 else if(/^\d+$/.test(path))data={id:path,name:"Campaign",account_id:"123",daily_budget:"300000",effective_status:campaignStatus};
 else throw Error("Unmocked "+path);
 return {ok:true,json:async()=>data};
};
assert.deepEqual(COMMANDS.map(c=>c.command),["menu","check","ds","dexuat","baocao","quetad","hoisinh","taikhoan","help"]);
await ensureBotMenu(true);await ensureBotMenu();assert.equal(telegram.filter(t=>t.method==="setMyCommands").length,1);
assert.equal(telegram.find(t=>t.method==="setChatMenuButton").body.menu_button.type,"commands");
assert.equal(REPLY_KEYBOARD.resize_keyboard,true);assert.equal(REPLY_KEYBOARD.is_persistent,true);
assert.equal(KEYBOARD_ROWS.length,4);assert.ok(KEYBOARD_ROWS.every(r=>r.length===2));
for(const label of KEYBOARD_ROWS.flat())assert.ok(await command(label));
assert.ok((await command("/menu")).text.includes("BẢNG ĐIỀU KHIỂN"));
assert.ok((await command("/start")).text.includes("BẢNG ĐIỀU KHIỂN"));
assert.ok((await command("không biết dùng")).cards[0].markup.inline_keyboard);
assert.ok((await callbackAction("ui:menu")).cards);
for(const route of ["check","ds","dexuat","baocao","quetad","hoisinh","taikhoan","help"])
 assert.ok(await callbackAction("ui:"+route));
const cards=(await command("/ds")).cards;
for(const action of ["vit:1","tat:1","nhanban:1","budget:1"])
 assert.ok(cards[0].markup.inline_keyboard.flat().some(b=>b.callback_data===action));
assert.ok((await command("/hoisinh")).cards[0].markup.inline_keyboard.flat().some(b=>b.callback_data==="bat:2"));
telegram=[];await sendOutput(dashboard());
const sends=telegram.filter(t=>t.method==="sendMessage");
assert.ok(sends[0].body.reply_markup.is_persistent);
assert.ok(sends[1].body.reply_markup.inline_keyboard);
assert.ok(!sends[1].body.reply_markup.keyboard);
const initial=await callbackAction("ui:setads");assert.equal(initial.cards[0].text,CREATE_PROMPT);
function reply(prior,text,override={}){return {text,reply_to_message:{text:prior,date:Math.floor(Date.now()/1000),from:{id:999,is_bot:true},...override}}}
const step2=await guidedReply(reply(CREATE_PROMPT,"https://facebook.com/888/posts/123/"));
assert.ok(step2.cards[0].text.includes("Bài viết: 888_123"));
const invalid=await guidedReply(reply(step2.cards[0].text,"abc"));
assert.ok(invalid.text.includes("Chưa hoàn tất"));assert.equal(invalid.cards[0].text,step2.cards[0].text);
const step3=await guidedReply(reply(step2.cards[0].text,"300000"));
assert.ok(step3.cards[0].text.includes("Ngân sách VND: 300000"));
writes=[];const created=await guidedReply(reply(step3.cards[0].text,"New campaign"));
assert.ok(created.text.includes("PAUSED"));
assert.ok(created.cards[0].markup.inline_keyboard.flat().some(b=>b.callback_data==="bat:99"));
assert.ok(writes.some(w=>w.path==="act_123/adcreatives"&&w.body.object_story_id==="888_123"));
assert.ok(!writes.some(w=>w.path==="99"&&w.body.status==="ACTIVE"));
assert.equal(await guidedReply(reply(CREATE_PROMPT,"123",{from:{id:1,is_bot:false}})),null);
assert.equal(await guidedReply(reply(CREATE_PROMPT,"123",{date:1})),null);
assert.equal(await guidedReply(reply(CREATE_PROMPT,"123",{forward_origin:{}})),null);
campaignStatus="PAUSED";const bp=await callbackAction("budget:1");
const changed=await guidedReply(reply(bp.cards[0].text,"250000"));
assert.ok(changed.text.includes("250.000"));
assert.ok(changed.cards[0].markup.inline_keyboard.flat().some(b=>b.callback_data==="bat:1"));
async function run(body,headers={"x-telegram-bot-api-secret-token":webhookSecret()}) {
 const res={setHeader(){},status(n){this.code=n;return this},json(b){this.body=b;return this},end(){return this}};
 await hook({method:"POST",headers,body},res);return res;
}
telegram=[];await run({update_id:800,message:{chat:{id:7162906074},text:"Không rõ lệnh"}});
assert.ok(telegram.filter(t=>t.method==="sendMessage").some(t=>t.body.reply_markup?.keyboard));
telegram=[];await run({update_id:801,callback_query:{id:"nav1",from:{id:7162906074},message:{chat:{id:7162906074},message_id:555},data:"ui:menu"}});
assert.equal(telegram[0].method,"answerCallbackQuery");
assert.ok(!telegram.some(t=>t.method==="editMessageReplyMarkup"));
writes=[];await run({callback_query:{id:"bad",from:{id:0},message:{chat:{id:7162906074},message_id:555},data:"vit:1"}});
assert.equal(writes.length,0);
assert.equal((await run({},{})).code,401);
console.log("PASS menus: exact commands, menu auto-registration/cache, persistent keyboard, all text/navigation routes, per-campaign actions, guided creation and budget, expired/forged prompt rejection, callback authorization and dashboard delivery");
