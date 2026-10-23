// Compatibility for customers who still have the previous storefront open.
const {redis}=require("../lib/commerce");
module.exports=async(req,res)=>{
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST")return res.status(405).end();
  const folio=String(req.body?.folio||""),token=String(req.body?.token||"");
  if(!/^\d{1,12}$/.test(folio)||!/^[a-f0-9]{48}$/.test(token))return res.status(400).json({error:"Cotización no válida"});
  try{
    const raw=await redis(["GET","mp:quote:draft:"+folio]);
    if(!raw)return res.status(404).json({error:"Cotización no encontrada"});
    if(JSON.parse(raw).token!==token)return res.status(403).json({error:"No se pudo confirmar esta cotización"});
    return res.status(200).json({folio,reserved:false,message:"Cotización guardada sin apartar existencias. La venta se confirma por folio."});
  }catch(e){
    console.error(e.message);
    return res.status(503).json({error:"No se pudo consultar la cotización"});
  }
};
