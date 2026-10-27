import assert from "node:assert/strict";
import * as fb from "../lib/facebook.js";
import hook, {command, callbackAction, HELP} from "../api/telegram.js";
import check from "../api/check-ads.js";
import mcp from "../api/mcp.js";
import {campaignKeyboard, webhookSecret, sendTelegram} from "../lib/telegram.js";
import {optimizationOutput} from "../lib/reports.js";
process.env.FB_AD_ACCOUNT_ID="act=123";process.env.FB_ACCESS_TOKEN=" token\n";
process.env.TELEGRAM_CHAT_ID="7162906074";process.env.TELEGRAM_BOT_TOKEN="test";process.env.AGENT_SECRET_KEY="secret";
const A=n=>[{action_type:"onsite_conversion.messaging_conversation_started_7d",value:String(n)}];
const cs=[
{id:"1",name:"Hero",daily_budget:"500000",effective_status:"ACTIVE"},
{id:"2",name:"Bad",daily_budget:"500000",effective_status:"ACTIVE"},
{id:"3",name:"Winner",daily_budget:"500000",effective_status:"ACTIVE"},
];
const today=[
{campaign_id:"1",campaign_name:"Hero",spend:"250000",actions:A(0),date_start:"2026-10-28"},
{campaign_id:"2",campaign_name:"Bad",spend:"200000",actions:A(4),date_start:"2026-10-28"},
{campaign_id:"3",campaign_name:"Winner",spend:"100000",actions:A(5),date_start:"2026-10-28"},
];
const history=[
{campaign_id:"1",campaign_name:"Hero",spend:"500000",actions:A(15)},
{campaign_id:"2",campaign_name:"Bad",spend:"500000",actions:A(5)},
{campaign_id:"4",campaign_name:"Paused",spend:"200000",actions:A(8)},
];
let writes=[],telegram=[],failHistory=false;
globalThis.fetch=async(url,opts={})=>{
 const u=new URL(url),path=u.pathname.replace("/v26.0/","");let data;
 if(url.includes("api.telegram.org")){
  const method=url.split("/").at(-1),body=JSON.parse(opts.body);
  telegram.push({method,body});return {ok:true,json:async()=>({ok:true,result:true})};
 }
 if(opts.method==="POST"){
  const body=JSON.parse(opts.body);writes.push({path,body});
  data=path.endsWith("/copies")?{copied_campaign_id:"99"}:{success:true};
 }else if(path==="act_123")data={id:"act_123",currency:"VND",name:"Test",account_status:1,disable_reason:0};
 else if(path==="act_123/campaigns"){
  const paused=u.searchParams.get("filtering")?.includes("PAUSED");
  data={data:paused?[{id:"4",name:"Paused",daily_budget:"300000",effective_status:"PAUSED"},{id:"5",effective_status:"PAUSED"}]:cs};
 } else if(path==="act_123/insights"){
  const preset=u.searchParams.get("date_preset"),level=u.searchParams.get("level");
  if(preset==="last_3d"&&failHistory)return {ok:false,status:500,json:async()=>({error:{message:"history failed",code:1}})};
  if(level==="ad")data={data:[{ad_id:"11",spend:"150000",actions:A(0)},{ad_id:"12",spend:"100000",actions:A(8)},{ad_id:"21",spend:"200000",actions:A(1)}]};
  else data={data:preset==="today"?today:preset==="last_3d"?history:preset==="yesterday"?history:
   [{campaign_id:"1",campaign_name:"Hero",spend:"1400000",actions:A(70)}]};
 } else if(path==="act_123/ads"){
  const filter=u.searchParams.get("filtering");
  data={data:filter.includes("DISAPPROVED")?[{id:"61",name:"Rejected",campaign_id:"1",effective_status:"DISAPPROVED"}]:
   [{id:"11",name:"Weak",campaign_id:"1",effective_status:"ACTIVE"},{id:"12",name:"Good",campaign_id:"1",effective_status:"ACTIVE"},
    {id:"21",name:"Solo",campaign_id:"2",effective_status:"ACTIVE"}]};
 } else if(path==="99/ads"||path==="99/adsets")data={data:[]};
 else if(path==="11")data={id:"11",account_id:"123",campaign_id:"1"};
 else if(/^\d+$/.test(path))data={id:path,name:"C"+path,account_id:"123",daily_budget:"500000"};
 else throw Error("Unmocked "+path);
 return {ok:true,status:200,json:async()=>data};
};
for(const [input,expected] of [
 ["123","123"],["888_123","888_123"],
 ["https://www.facebook.com/888/posts/123/","888_123"],
 ["https://facebook.com/user/posts/123?x=1","123"],
 ["https://m.facebook.com/888/videos/123/","888_123"],
 ["https://www.facebook.com/story.php?story_fbid=123&id=888","888_123"],
 ["https://www.facebook.com/photo.php?fbid=123","123"]
])assert.equal(fb.parsePostId(input),expected);
assert.throws(()=>fb.parsePostId("https://evil.com/888/posts/123"));
assert.throws(()=>fb.parsePostId("https://facebook.com/share/abc"));
assert.equal(fb.messagesFrom([...A(0),{action_type:"lead",value:"10"}]).messages,0);
assert.equal(fb.isHistoricalWinner({messages:15,cost_per_message:34999}),true); assert.equal(fb.isHistoricalWinner({messages:14,cost_per_message:30000}),false); assert.equal(fb.isHistoricalWinner({messages:15,cost_per_message:35000}),false); let r=await fb.optimize();
assert.equal(r.paused_count,1);assert.equal(r.paused_campaigns[0].id,"2");
assert.equal(r.protected_campaigns[0].id,"1");assert.equal(r.winning_campaigns[0].id,"3");
assert.ok(!writes.some(w=>w.path==="1"&&w.body.status==="PAUSED"));
assert.equal(r.ad_recommendations.length,1);assert.equal(r.ad_recommendations[0].id,"11");
const output=optimizationOutput(r);
assert.ok(output.cards.find(c=>c.text.includes("công thần")).markup.inline_keyboard.flat().some(b=>b.callback_data==="keep:1"));
assert.ok(campaignKeyboard({id:"4",effective_status:"PAUSED"}).inline_keyboard[0].some(b=>b.callback_data==="bat:4"));
writes=[];failHistory=true;await assert.rejects(()=>fb.optimize(),/history failed/);assert.equal(writes.length,0);failHistory=false;
const resurrect=await fb.resurrection();assert.deepEqual(resurrect.map(c=>c.id),["4"]);
const health=await fb.accountHealth();assert.equal(health.problem_ads[0].effective_status,"DISAPPROVED");
const summary=await fb.accountReport();assert.equal(summary.spend,550000);assert.equal(summary.messages,9);
assert.equal(summary.seven_days.average_daily_spend,200000);
assert.equal(summary.seven_days.cost_per_message,20000);
assert.equal(summary.best_campaign.id,"3");assert.equal(summary.worst_campaign.id,"1");
assert.ok(fb.accountReportText(summary).includes("TỔNG KẾT"));
assert.ok((await command("/ds")).cards.every(c=>c.markup.inline_keyboard));
assert.ok((await command("/dexuat")).cards.some(c=>c.text.includes("AD CẦN")));
assert.equal((await command("/quetad")).cards.length,1);
assert.ok((await command("/hoisinh")).cards[0].markup.inline_keyboard[0][0].text.includes("Bật lại"));
assert.ok((await command("/taikhoan")).text.includes("account_status"));
assert.ok((await command("/baocao")).includes("TỔNG KẾT"));
assert.ok((await command("/check")).cards.length>0);
assert.ok(HELP.includes("/quetad"));
assert.ok((await callbackAction("vit:1")).includes("600.000"));
assert.ok((await callbackAction("tat:1")).includes("tắt"));
assert.ok((await callbackAction("bat:1")).includes("bật"));
assert.ok((await callbackAction("nhanban:1")).includes("/bat 99"));
assert.ok((await callbackAction("keep:1")).includes("Giữ theo dõi"));
assert.ok((await callbackAction("tatad:11")).includes("tắt riêng Ad"));
await assert.rejects(()=>callbackAction("evil:1"));
async function run(fn,req){const res={setHeader(){},status(c){this.code=c;return this},json(b){this.body=b;return this},end(){return this}};await fn(req,res);return res;}
const headers={"x-telegram-bot-api-secret-token":webhookSecret()};
telegram=[];writes=[];
const callback={id:"cb1",from:{id:7162906074},message:{chat:{id:7162906074},message_id:50},data:"vit:1"};
await run(hook,{method:"POST",headers,body:{update_id:1,callback_query:callback}});
assert.equal(telegram[0].method,"answerCallbackQuery");
assert.ok(writes.some(w=>w.body.daily_budget===600000));const count=writes.length;
await run(hook,{method:"POST",headers,body:{update_id:2,callback_query:callback}});
assert.equal(writes.length,count);
writes=[];await run(hook,{method:"POST",headers,body:{callback_query:{...callback,id:"cb2",from:{id:0}}}});
assert.equal(writes.length,0);
assert.equal((await run(hook,{method:"POST",headers:{},body:{}})).code,401);
telegram=[];await run(hook,{method:"POST",headers,body:{update_id:10,message:{chat:{id:7162906074},text:"/ds"}}});
assert.ok(telegram.filter(t=>t.method==="sendMessage").some(t=>t.body.reply_markup?.inline_keyboard));
telegram=[];const daily=await run(check,{headers:{authorization:"Bearer secret"},query:{report:"daily"}});
assert.equal(daily.body.report.date_preset,"yesterday");assert.equal(daily.body.status,"success");
telegram=[];const checked=await run(check,{headers:{authorization:"Bearer secret"},query:{notify_all:"1"}});
assert.equal(checked.body.protected_campaigns.length,1);
const rpc=await run(mcp,{method:"POST",headers:{"content-type":"application/json",accept:"application/json"},body:{jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"checkFacebookAdsRules"}}});
assert.equal(JSON.parse(rpc.body.result.content[0].text).protected_campaigns.length,1);
telegram=[];await sendTelegram("a".repeat(8000),false,campaignKeyboard({id:"1"}));
assert.ok(telegram.every(t=>t.body.text.length<=3500));
assert.equal(telegram.filter(t=>t.body.reply_markup).length,1);
console.log("PASS advanced: history guard/fail-closed, Ad thresholds/multi-ad scope, URL parsing, resurrection, health, weighted 7-day report, all new commands, callback ack/auth/dedup/actions, cards, daily/API/MCP, Telegram chunking");



