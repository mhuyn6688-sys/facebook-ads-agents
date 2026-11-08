import assert from "node:assert/strict";
import { assistantReply, gatewayCompletion, GatewayError, assistantError } from "../lib/assistant.js";
import { createToolRunner } from "../lib/assistant-tools.js";
function memory(initial={turns:[],knownCampaigns:[],focus:[],completed:[]}) {
  let state=structuredClone(initial),version=0;
  return {get state(){return structuredClone(state)},
    async load(){return {state:structuredClone(state),etag:String(version)}},
    async save(next,etag){assert.equal(etag,String(version));state=structuredClone(next);return String(++version)}};
}
const called=(name,args,id="call")=>({content:null,tool_calls:[{id,type:"function",function:{name,arguments:JSON.stringify(args)}}]});
let store=memory(),requests=[];
let result=await assistantReply({chatId:"1",botId:"2",text:"Tôi tên Minh, chào bạn",updateId:1,store,
 complete:async messages=>{requests.push(messages);return {content:"Chào Minh! Bạn muốn trao đổi điều gì hôm nay?"}}});
assert.ok(result.includes("Minh"));
result=await assistantReply({chatId:"1",botId:"2",text:"Tôi tên gì?",updateId:2,store,
 complete:async messages=>{assert.ok(messages.some(m=>m.content?.includes("Tôi tên Minh")));return {content:"Bạn tên Minh."}}});
assert.equal(result,"Bạn tên Minh.");
let writeCount=0,iteration=0;
const fixtures={snapshot:async()=>[{id:"123",name:"Alpha",effective_status:"ACTIVE",daily_budget:200000,spend:20000,messages:1,cost_per_message:20000}],
 campaign:async id=>({id,name:"Alpha",daily_budget:200000}),
 setStatus:async(id,status)=>{writeCount++;assert.equal(store.state.current.actions[0].status,"started");return {id,status}}};
store=memory();iteration=0;
result=await assistantReply({chatId:"1",botId:"2",text:"Tắt cam Alpha đi",updateId:10,store,toolApi:fixtures,
 complete:async messages=>{
  if(iteration++===0)return called("read_ads_data",{source:"campaigns",query:"Alpha"},"r");
  if(iteration===2)return called("perform_action",{operation:"pause",campaign_id:"123"},"w");
  assert.ok(messages.some(m=>m.role==="tool"&&m.content.includes("executed")));return {content:"Đã tắt Alpha."};
 }});
assert.equal(writeCount,1);assert.equal(result,"Đã tắt Alpha.");
assert.equal(await assistantReply({chatId:"1",botId:"2",text:"Tắt cam Alpha đi",updateId:10,store,
 complete:async()=>{throw Error("Duplicate must not invoke AI")}}),null);
let state={turns:[],knownCampaigns:[{id:"123",name:"Alpha"}],focus:["123"],current:{updateId:20,actions:[]}};
let runner=createToolRunner({state,userText:"Có nên tắt Alpha không?",checkpoint:async()=>{},api:fixtures});
await assert.rejects(()=>runner("perform_action",{operation:"pause",campaign_id:"123"}),/chưa yêu cầu/);
assert.equal(writeCount,1);
runner=createToolRunner({state,userText:"Đổi ngân sách Alpha 200k",checkpoint:async()=>{},api:fixtures});
await assert.rejects(()=>runner("perform_action",{operation:"set_budget",campaign_id:"123",amount_vnd:300000}),/Ngân sách/);
runner=createToolRunner({state,userText:"đồng ý",checkpoint:async()=>{},api:fixtures});
await runner("prepare_action",{operation:"pause",campaign_id:"123"});
await assert.rejects(()=>runner("perform_action",{operation:"pause",campaign_id:"123"}),/chưa yêu cầu/);
state.current={updateId:21,actions:[]};runner=createToolRunner({state,userText:"đồng ý",checkpoint:async()=>{},api:{...fixtures,setStatus:async(id,status)=>{writeCount++;return {id,status}}}});
assert.equal((await runner("perform_action",{operation:"pause",campaign_id:"123"})).status,"executed");
assert.equal(writeCount,2);
assert.equal((await runner("perform_action",{operation:"pause",campaign_id:"123"})).status,"executed");
assert.equal(writeCount,2);
state={knownCampaigns:[{id:"123",name:"Alpha"}],focus:["123"],current:{updateId:30,actions:[]}};
let attempts=0;
runner=createToolRunner({state,userText:"Tắt Alpha đi",checkpoint:async()=>{},api:{...fixtures,setStatus:async()=>{attempts++;throw Error("timeout")}}});
await assert.rejects(()=>runner("perform_action",{operation:"pause",campaign_id:"123"}),/timeout/);
await assert.rejects(()=>runner("perform_action",{operation:"pause",campaign_id:"123"}),/Không tự thử lại/);
assert.equal(attempts,1);
runner=createToolRunner({state:{current:{updateId:31,actions:[]}},userText:"Tắt Alpha đi",readOnly:true,checkpoint:async()=>{},api:fixtures});
await assert.rejects(()=>runner("perform_action",{operation:"pause",campaign_id:"123"}),/chuyển tiếp/);
await assert.rejects(()=>runner("anything",{url:"evil"}),/không được phép/);
state={knownCampaigns:[{id:"123",name:"Alpha"},{id:"456",name:"Alpha"}],focus:["123","456"],current:{updateId:32,actions:[]}};
runner=createToolRunner({state,userText:"Tắt Alpha đi",checkpoint:async()=>{},api:fixtures});
await assert.rejects(()=>runner("perform_action",{operation:"pause",campaign_id:"123"}),/duy nhất/);
let lock=memory({turns:[],current:{updateId:40,startedAt:Date.now(),actions:[]},completed:[]});
assert.ok((await assistantReply({chatId:"1",botId:"2",text:"hỏi tiếp",updateId:41,store:lock})).includes("đang xử lý"));
store=memory();store.save=async()=>{throw Error("etag mismatch")};
assert.ok((await assistantReply({chatId:"1",botId:"2",text:"hi",updateId:42,store})).includes("chưa chạy thao tác"));
process.env.AI_PROVIDER="vercel";process.env.AI_GATEWAY_MODEL="openai/gpt-4.1-mini";delete process.env.AI_GATEWAY_API_KEY;
globalThis.fetch=async(url,opts)=>{
 const body=JSON.parse(opts.body);assert.equal(opts.headers.Authorization,"Bearer oidc-current");
 assert.ok(!JSON.stringify(body).includes("oidc-current"));assert.ok(body.tools.length>0);
 return {ok:true,json:async()=>({choices:[{message:{content:"AI trả lời thật"}}]})};
};
assert.equal((await gatewayCompletion([{role:"user",content:"hi"}],"oidc-current")).content,"AI trả lời thật");
globalThis.fetch=async()=>({ok:false,status:402,json:async()=>({error:{code:"insufficient_funds"}})});
await assert.rejects(()=>gatewayCompletion([],"oidc-current"),GatewayError);
assert.ok(assistantError(new GatewayError(402,"insufficient_funds")).includes("credit"));
console.log("PASS assistant: natural chat/memory, live-data tool loop, explicit mutation, advice/ambiguity/amount guards, prior-turn consent, duplicate and ambiguous-write protection, readonly forwarded content, CAS/lock handling, OIDC and gateway errors");

process.env.AI_PROVIDER="gemini";process.env.GEMINI_API_KEY="test-google-key";
globalThis.fetch=async(url,opts)=>{
 assert.ok(url.endsWith("/models/gemini-3.5-flash-lite:generateContent"));
 assert.equal(opts.headers["x-goog-api-key"],"test-google-key");
 const body=JSON.parse(opts.body);assert.ok(body.generationConfig);assert.ok(body.tools.length>0);
 assert.ok(!JSON.stringify(body).includes("test-google-key"));
 return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:"Gemini trả lời"}]}}]})};
};
assert.equal((await gatewayCompletion([],"must-not-use-vercel-oidc")).content,"Gemini trả lời");
let attemptsFree=0;
globalThis.fetch=async(url)=>{attemptsFree++;assert.ok(url.includes("googleapis.com"));return {ok:false,status:429,json:async()=>({error:{code:429,status:"RESOURCE_EXHAUSTED"}})};};
await assert.rejects(()=>gatewayCompletion([],"vercel-credential"),GatewayError);
assert.equal(attemptsFree,1);
assert.ok(assistantError(new GatewayError(429,"quota","gemini")).includes("miễn phí"));
delete process.env.GEMINI_API_KEY;
await assert.rejects(()=>gatewayCompletion([],"vercel-credential"),error=>error.provider==="gemini"&&error.code==="missing_configuration");
assert.equal(attemptsFree,1);
console.log("PASS free Gemini: direct Google endpoint, tool calling payload, private API key, quota handling, no paid fallback");



