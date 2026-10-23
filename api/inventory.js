const {catalog,redis,stripe,transitionReservation}=require("../lib/commerce");
module.exports=async(req,res)=>{
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="GET")return res.status(405).end();
  try{
    const now=Date.now(),stocks={};
    for(const p of catalog){
      const key="mp:stock:"+encodeURIComponent(p.name);
      await redis(["SET",key,String(p.stock),"NX"]);
      stocks[p.name]=Number(await redis(["GET",key])||0);
    }
    const refs=await redis(["ZRANGEBYSCORE","mp:pending","-inf","+inf"])||[];
    for(const ref of refs){
      try{
        const raw=await redis(["GET","mp:res:"+ref]);
        if(!raw){await redis(["ZREM","mp:pending",ref]);continue}
        const hold=JSON.parse(raw);
        if(hold.status!=="pending"){await redis(["ZREM","mp:pending",ref]);continue}
        if(hold.type==="quote"&&!hold.session){
          // Preserve old folios before releasing their former automatic holds.
          const draftKey="mp:quote:draft:"+ref;
          const draftRaw=await redis(["GET",draftKey]);
          if(draftRaw)await redis(["PERSIST",draftKey]);
          else await redis(["SET",draftKey,JSON.stringify({type:"quote",folio:ref,status:"pending",items:hold.items}),"NX"]);
          await transitionReservation(ref,"released");continue;
        }
        if(hold.session){
          const session=await stripe("checkout/sessions/"+hold.session,{},"GET");
          if(session.payment_status==="paid"){await transitionReservation(ref,"paid");continue}
          if(Number(hold.expiresAt||0)>now&&session.status!=="expired")continue;
          if(session.status==="open")await stripe("checkout/sessions/"+session.id+"/expire",{});
        }
        if(!hold.session&&Number(hold.expiresAt||0)>now)continue;
        await transitionReservation(ref,"released");
      }catch(e){console.error("No se pudo resolver el apartado "+ref+":",e.message)}
    }
    for(const p of catalog)stocks[p.name]=Number(await redis(["GET","mp:stock:"+encodeURIComponent(p.name)])||0);
    return res.status(200).json({stocks});
  }catch(e){
    console.error(e.message);
    return res.status(503).json({error:"Error al actualizar existencias"});
  }
};
