import assert from "node:assert/strict";
import {browsePosts,setAds} from "../lib/facebook.js";
import {openPostPicker,selectPostCallback} from "../lib/post-picker.js";
import {command,callbackAction,guidedReply} from "../api/telegram.js";
import {conversationPath} from "../lib/conversation-store.js";
process.env.FB_AD_ACCOUNT_ID="123";process.env.FB_ACCESS_TOKEN="ads-token";
process.env.TELEGRAM_BOT_TOKEN="999:test";process.env.TELEGRAM_CHAT_ID="7162906074";
let writes=[],mode="page",badCreative=false,incompatible=false,video=false;
globalThis.fetch=async(url,opts={})=>{
 const u=new URL(url),p=u.pathname.replace("/v26.0/","");let data;
 if(opts.method==="POST"){
  const b=JSON.parse(opts.body);writes.push({p,b});
  if(p==="act_123/adcreatives"&&badCreative)return {ok:false,status:400,json:async()=>({error:{message:"Exact Meta rejection",code:100,error_subcode:1885194}})};
  if(p==="act_123/ads"&&incompatible&&b.creative?.creative_id==="777")return {ok:false,status:400,json:async()=>({error:{message:"Incompatible",code:100,error_subcode:1487891}})};
  data=p==="12/copies"?{copied_adset_id:"992"}:p==="act_123/ads"?{id:"991"}:p==="1/copies"?{copied_campaign_id:"99"}:p==="act_123/adcreatives"?{id:b.object_story_spec?"778":"777"}:{success:true};
 }else if(p==="act_123")data={currency:"VND"};
 else if(p==="act_123/campaigns")data={data:[{id:"1",name:"Template",created_time:"2026-11-09",daily_budget:"200000",effective_status:"ACTIVE"}]};
 else if(p==="1"||p==="2"||p==="99")data={id:p,name:"Template",account_id:"123",daily_budget:"200000"};
 else if(p==="1/adsets")data={data:[{id:"12",optimization_goal:"CONVERSATIONS",destination_type:"MESSENGER"}]};
 else if(p==="1/ads")data={data:[{id:"11",name:"Used Ad",adset_id:"12",creative:{id:"555",object_story_id:"888_111",body:"Original content"}}]};
 else if(p==="888_222")data={id:p,message:"Original copy",attachments:{data:[{media_type:video?"video":"photo",target:{id:"123456"},media:{image:{src:"https://example.com/original.jpg"}}}]}};
 else if(p==="888/published_posts"){
  if(mode==="fallback"||(mode==="page-token"&&opts.headers.Authorization!=="Bearer page-secret"))
   return {ok:false,status:403,json:async()=>({error:{message:"Page permission not available",code:10}})};
  data={data:[{id:"888_222",message:"A new published post",permalink_url:"https://facebook.com/888/posts/222",created_time:"2026-11-08"}],paging:{next:"https://ignored",cursors:{after:"cursor"}}};
 }else if(p==="act_123/ads")data={data:[{id:"22",name:"Second CBO post",campaign_id:"2",creative:{id:"666",object_story_id:"888_333",body:"Second campaign content"}}]};
 else if(p==="me/accounts")data={data:mode==="page-token"?[{id:"888",access_token:"page-secret"}]:[]};
 else if(p==="99/ads")data={data:[{id:"991"}]};
 else if(p==="99/adsets")data={data:[{id:"992"}]};
 else throw Error("Unmocked "+p);
 return {ok:true,status:200,json:async()=>data};
};
const page=await browsePosts();assert.equal(page.page_id,"888");assert.ok(page.posts.some(p=>p.id==="888_222"));assert.ok(page.posts.some(p=>p.creative_id==="555"));
mode="fallback";const fallback=await browsePosts();assert.ok(fallback.page_error);assert.equal(fallback.posts[0].id,"888_111");assert.ok(fallback.posts.some(p=>p.id==="888_333"&&p.template_id==="2"));
mode="page-token";const pageToken=await browsePosts();assert.ok(pageToken.posts.some(p=>p.id==="888_222"));assert.ok(!JSON.stringify(pageToken).includes("page-secret"));
mode="page";
let state={},version=0;
const store={async load(){return {state:structuredClone(state),etag:String(version)}},
 async save(s,etag){assert.equal(etag,String(version));state=structuredClone(s);return String(++version)}};
const picker=await openPostPicker({store,browse:async()=>page,now:()=>1000});
assert.ok(picker.cards[0].markup.inline_keyboard[0][0].text.includes("Dùng bài"));
const callback=picker.cards[0].markup.inline_keyboard[0][0].callback_data;
assert.ok(Buffer.byteLength(callback)<=64);
const selected=await selectPostCallback(callback,{store,now:()=>2000});
assert.ok(selected.cards[0].text.includes("Mẫu CBO: 1"));assert.ok(selected.cards[0].text.includes("Bài viết: 888_"));
await assert.rejects(()=>selectPostCallback(callback,{store,now:()=>1900000}),/hết hạn/);
await assert.rejects(()=>selectPostCallback("pickpost:aaaaaaaaaa:0",{store,now:()=>2000}),/hết hạn/);
assert.notEqual(conversationPath("1","999"),conversationPath("1","999","post-picker"));
assert.equal((await command("/setads",{openPostPicker:async()=>picker})).text,picker.text);
assert.equal((await callbackAction("ui:setads",{openPostPicker:async()=>picker})).text,picker.text);
writes=[];await setAds("888_111",200000,"New", {templateId:"1",creativeId:"555"});
assert.ok(!writes.some(w=>w.p==="act_123/adcreatives"));
assert.ok(writes.some(w=>w.p==="act_123/ads"&&w.b.creative.creative_id==="555"));
assert.ok(!writes.some(w=>w.p==="99"&&w.b.status==="ACTIVE"));
writes=[];await assert.rejects(()=>setAds("888_222",200000,"New",{templateId:"1",creativeId:"555"}),/không còn/);assert.equal(writes.length,0);
badCreative=true;writes=[];await assert.rejects(()=>setAds("888_222",200000,"New",{templateId:"1"}),/100.*1885194/);
assert.ok(!writes.some(w=>w.p.endsWith("/copies")));
const postPrompt="🚀 Lên Cam mới — Bước 2/3\nBài viết: 888_111\nMẫu CBO: 1\nMẫu creative: 555\nTrả lời ngân sách.";
const reply=(text,prior)=>({text,reply_to_message:{text:prior,date:Math.floor(Date.now()/1000),from:{id:999,is_bot:true}}});
const third=await guidedReply(reply("200000",postPrompt));
assert.ok(third.cards[0].text.includes("Mẫu creative: 555"));
badCreative=false;writes=[];
const final=await guidedReply(reply("Chosen Post Campaign",third.cards[0].text));
assert.ok(final.text.includes("PAUSED"));assert.ok(!writes.some(w=>w.p==="act_123/adcreatives"));
console.log("PASS post picker: published/reusable posts, Page-token fallback without leaks, nonce/expiry, namespace isolation, button routes, pinned template/creative, no campaign copy on creative rejection, guided creation stays PAUSED");



badCreative=false;incompatible=true;writes=[];
await setAds("888_222",200000,"New messaging post",{templateId:"1"});
const rebuilt=writes.find(w=>w.p==="act_123/adcreatives"&&w.b.object_story_spec).b.object_story_spec;
assert.equal(rebuilt.link_data.message,"Original copy");
assert.equal(rebuilt.link_data.picture,"https://example.com/original.jpg");
assert.equal(rebuilt.link_data.call_to_action.type,"MESSAGE_PAGE");
assert.equal(writes.filter(w=>w.p==="act_123/ads").length,2);
assert.equal(writes.filter(w=>w.p==="act_123/ads").at(-1).b.creative.creative_id,"778");
assert.ok(!writes.some(w=>w.p==="99"&&w.b.status==="ACTIVE"));
console.log("PASS explicit objective incompatibility rebuilds original post content for Messenger, retries only rejected ad, stays PAUSED");

video=true;writes=[];await setAds("888_222",200000,"Video campaign",{templateId:"1"});
assert.equal(writes.find(w=>w.p==="act_123/adcreatives"&&w.b.object_story_spec).b.object_story_spec.video_data.video_id,"123456");
console.log("PASS video content uses numeric video ID, original thumbnail and Messenger CTA");
