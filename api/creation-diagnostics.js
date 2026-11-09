import {webhookSecret} from "../lib/telegram.js";
import {campaign,graph} from "../lib/facebook.js";
export default async function handler(req,res){
 if(req.method!=="POST"||req.headers["x-telegram-bot-api-secret-token"]!==webhookSecret())return res.status(401).json({error:"Unauthorized"});
 try{
 const b=typeof req.body==="string"?JSON.parse(req.body):req.body;
 const source=await campaign(b.template_id,true),draft=await campaign(b.draft_id,true);
 if(draft.effective_status!=="PAUSED")throw Error("Draft must be PAUSED");
 const fields="id,name,optimization_goal,billing_event,targeting,promoted_object,attribution_spec";
 return res.status(200).json({source:await graph(source.id+"/adsets",{fields,limit:100}),draft:await graph(draft.id+"/adsets",{fields,limit:100}),ads:await graph(draft.id+"/ads",{fields:"id",limit:100})});
 }catch(e){return res.status(400).json({error:e.message});}
}