const {redis}=require("../lib/commerce");
module.exports=async(req,res)=>{
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST")return res.status(405).end();
  const folio=String(req.body?.folio||""),token=String(req.body?.token||"");
  if(!/^\d{1,12}$/.test(folio)||!/^[a-f0-9]{48}$/.test(token))return res.status(400).json({error:"Cotización no válida"});
  try{
    const now=Date.now(),expiresAt=now+10800000;
    const lua="local existing=redis.call('GET',KEYS[2]);if existing then local h=cjson.decode(existing);if h.status=='pending' and h.quoteToken==ARGV[1] then return 2 else return -3 end end;local raw=redis.call('GET',KEYS[1]);if not raw then return -1 end;local d=cjson.decode(raw);if d.token~=ARGV[1] then return -2 end;for i,item in ipairs(d.items) do local k=KEYS[i+2];if redis.call('EXISTS',k)==0 then redis.call('SET',k,tostring(item.stock)) end end;for i,item in ipairs(d.items) do if tonumber(redis.call('GET',KEYS[i+2]))<tonumber(item.quantity) then return 0 end end;for i,item in ipairs(d.items) do redis.call('DECRBY',KEYS[i+2],tonumber(item.quantity)) end;local h={type='quote',folio=d.folio,status='pending',expiresAt=tonumber(ARGV[2]),quoteToken=ARGV[1],items={}};for _,item in ipairs(d.items) do table.insert(h.items,{name=item.name,quantity=item.quantity}) end;redis.call('SET',KEYS[2],cjson.encode(h),'EX',14400);redis.call('ZADD',KEYS[#KEYS],ARGV[2],d.folio);return 1";
    const draftRaw=await redis(["GET","mp:quote:draft:"+folio]);
    if(!draftRaw)return res.status(410).json({error:"La cotización venció; envía una nueva."});
    const draft=JSON.parse(draftRaw);
    if(draft.token!==token)return res.status(403).json({error:"No se pudo confirmar esta cotización."});
    const stockKeys=draft.items.map(i=>"mp:stock:"+encodeURIComponent(i.name));
    const result=Number(await redis(["EVAL",lua,String(stockKeys.length+3),"mp:quote:draft:"+folio,"mp:res:"+folio,...stockKeys,"mp:pending",token,String(expiresAt)]));
    if(result===1||result===2){
      const hold=JSON.parse(await redis(["GET","mp:res:"+folio]));
      return res.status(200).json({folio,expiresAt:hold.expiresAt,reserved:true});
    }
    if(result===0)return res.status(409).json({error:"Ya no hay existencias suficientes. Actualiza tu bolsita y cotiza de nuevo."});
    if(result===-1)return res.status(410).json({error:"La cotización venció; envía una nueva."});
    if(result===-2)return res.status(403).json({error:"No se pudo confirmar esta cotización."});
    return res.status(409).json({error:"Esta cotización ya no está disponible. Envía una nueva."});
  }catch(e){
    console.error(e.message);
    return res.status(503).json({error:"No se pudo apartar el inventario. Intenta de nuevo."});
  }
};