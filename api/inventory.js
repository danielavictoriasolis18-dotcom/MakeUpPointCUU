const {catalog,redis,stripe,transitionReservation}=require("../lib/commerce");
module.exports=async(req,res)=>{res.setHeader("Cache-Control","no-store");if(req.method!=="GET")return res.status(405).end();try{
 const stocks={};for(const p of catalog){const k="mp:stock:"+encodeURIComponent(p.name);await redis(["SET",k,String(p.stock),"NX"]);stocks[p.name]=Number(await redis(["GET",k])||0)}
 const refs=await redis(["ZRANGEBYSCORE","mp:pending","-inf",String(Date.now())])||[];
 for(const ref of refs){try{const raw=await redis(["GET","mp:res:"+ref]);if(!raw){await redis(["ZREM","mp:pending",ref]);continue}const hold=JSON.parse(raw);if(hold.status!=="pending"){await redis(["ZREM","mp:pending",ref]);continue}if(hold.session){const cs=await stripe("checkout/sessions/"+hold.session,{},"GET");if(cs.payment_status==="paid"){await transitionReservation(ref,"paid");continue}if(cs.status==="open")await stripe("checkout/sessions/"+cs.id+"/expire",{})}await transitionReservation(ref,"released")}catch(e){console.error("No se pudo resolver el apartado "+ref+":",e.message)}}
 for(const p of catalog)stocks[p.name]=Number(await redis(["GET","mp:stock:"+encodeURIComponent(p.name)])||0);
 return res.status(200).json({stocks})
}catch(e){console.error(e.message);return res.status(503).json({error:"Error al actualizar existencias"})}};