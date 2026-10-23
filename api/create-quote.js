const crypto=require("crypto");
const {catalog,redis}=require("../lib/commerce");
module.exports=async(req,res)=>{
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST")return res.status(405).end();
  try{
    const grouped={};
    for(const row of req.body?.items||[]){
      const p=catalog.find(x=>x.name===row.name),q=Number(row.quantity);
      if(!p||!Number.isInteger(q)||q<1)return res.status(400).json({error:"Cantidad no válida"});
      grouped[p.name]=(grouped[p.name]||0)+q;
      if(grouped[p.name]>p.stock)return res.status(400).json({error:"Cantidad no válida"});
    }
    const items=Object.entries(grouped).map(([name,quantity])=>{const p=catalog.find(x=>x.name===name);return{name,quantity,stock:p.stock,price:p.price}});
    if(!items.length)return res.status(400).json({error:"Bolsita vacía"});
    await redis(["SET","mp:quote:seq","99","NX"]);
    const folio=String(await redis(["INCR","mp:quote:seq"]));
    const token=crypto.randomBytes(24).toString("hex");
    const draft={type:"quote",status:"pending",folio,token,createdAt:Date.now(),items};
    await redis(["SET","mp:quote:draft:"+folio,JSON.stringify(draft)]);
    return res.status(200).json({folio,token});
  }catch(e){
    console.error(e.message);
    return res.status(500).json({error:"No se pudo generar la cotización"});
  }
};