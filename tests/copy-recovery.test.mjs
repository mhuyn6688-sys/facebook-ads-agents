import assert from "node:assert/strict";
import {duplicate,FacebookApiError} from "../lib/facebook.js";
process.env.FB_AD_ACCOUNT_ID="123";process.env.FB_ACCESS_TOKEN="test";
let writes=[],mode="large";
globalThis.fetch=async(url,opts={})=>{
 const path=new URL(url).pathname.replace("/v26.0/","");let data;
 if(opts.method==="POST"){
  const b=JSON.parse(opts.body);writes.push({path,b});
  if(path==="1/copies"&&b.deep_copy){
   if(mode==="timeout")throw Error("timeout");
   return {ok:false,status:400,json:async()=>({error:{message:"Invalid parameter",error_user_title:"Copy limit",error_user_msg:"Too many objects",code:100,error_subcode:mode==="large"?1885194:99}})};
  }
  if(path==="1/copies")data={copied_campaign_id:"9"};
  else if(path==="2/copies")data={copied_adset_id:"20"};
  else if(path==="3/copies"){if(mode==="childfail")throw Error("timeout");data={copied_ad_id:"30"};}
  else data={success:true};
 }else if(path==="act_123")data={currency:"VND"};
 else if(path==="1"||path==="9")data={account_id:"123",daily_budget:"200000"};
 else if(path==="1/adsets")data={data:[{id:"2"}]};
 else if(path==="1/ads")data={data:[{id:"3",adset_id:"2"}]};
 else if(path==="9/adsets")data={data:[{id:"20"}]};
 else if(path==="9/ads")data={data:[{id:"30"}]};
 else throw Error("Unexpected "+path);
 return {ok:true,status:200,json:async()=>data};
};
assert.equal(await duplicate("1",200000,{prepare:false}),"9");
assert.equal(writes.filter(w=>w.path==="1/copies").length,2);
assert.equal(writes.find(w=>w.path==="2/copies").b.campaign_id,"9");
assert.equal(writes.find(w=>w.path==="3/copies").b.adset_id,"20");
assert.ok(writes.every(w=>w.b.status!=="ACTIVE"));
for(const failure of ["timeout","other"]){
 mode=failure;writes=[];
 await assert.rejects(()=>duplicate("1",200000),failure==="timeout"?/kết nối/:/Copy limit.*Too many objects/);
 assert.equal(writes.filter(w=>w.path.endsWith("/copies")).length,1);
}
const error=new FacebookApiError({status:400},{error:{message:"Invalid parameter",error_user_msg:"Specific reason",code:100,error_subcode:1885194}});
assert.match(error.message,/Specific reason/);
console.log("PASS copy limit recovery: shallow campaign/adsets/ads, pinned parents, paused, no retry for timeouts/unrelated errors, exact Meta user details");
