const {catalog,redis,stripe,transitionReservation}=require("../lib/commerce");
const site="https://makeuppointcuu.vercel.app";
module.exports=async(req,res)=>{
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="POST")return res.status(405).end();
 let ref,items=[],reservation,createdSession=false;
 try{
  const grouped={};
  for(const row of req.body?.items||[]){const p=catalog.find(x=>x.name===row.name),q=Number(row.quantity);if(!p||!Number.isInteger(q)||q<1||q>24)return res.status(400).json({error:"Cantidad no válida"});grouped[p.name]=(grouped[p.name]||0)+q}
  items=Object.entries(grouped).map(([name,quantity])=>({name,quantity,p:catalog.find(x=>x.name===name)}));
  if(!items.length)return res.status(400).json({error:"Bolsita vacía"});
  ref="MP-"+Date.now().toString(36).toUpperCase()+"-"+Math.random().toString(36).slice(2,6).toUpperCase();
  const keys=items.map(i=>"mp:stock:"+encodeURIComponent(i.name));
  const lua="for i=1,#KEYS do if redis.call('EXISTS',KEYS[i])==0 then redis.call('SET',KEYS[i],ARGV[i]) end end;for i=1,#KEYS do if tonumber(redis.call('GET',KEYS[i]))<tonumber(ARGV[#KEYS+i]) then return 0 end end;for i=1,#KEYS do redis.call('DECRBY',KEYS[i],ARGV[#KEYS+i]) end;return 1";
  const ok=await redis(["EVAL",lua,String(keys.length),...keys,...items.map(i=>i.p.stock),...items.map(i=>i.quantity)]);
  if(!Number(ok))return res.status(409).json({error:"Existencia cambió, actualiza tu bolsita"});
  reservation={type:"stripe",status:"pending",expiresAt:Date.now()+10800000,items:items.map(({name,quantity})=>({name,quantity}))};
  await redis(["SET","mp:res:"+ref,JSON.stringify(reservation)]);
  await redis(["ZADD","mp:pending",String(reservation.expiresAt),ref]);
  const subtotal=items.reduce((s,i)=>s+i.p.price*i.quantity,0),discount=subtotal>=2000?Math.floor(subtotal*.05):0;
  const params={mode:"payment",success_url:site+"/?pago=exitoso&session_id={CHECKOUT_SESSION_ID}",cancel_url:site+"/?pago=cancelado","payment_method_types[0]":"card",client_reference_id:ref,"metadata[store]":"MakeUpPoint","metadata[order_ref]":ref,"metadata[items]":items.map(i=>i.name+" x "+i.quantity).join("; ").slice(0,500)};
  params.expires_at=String(Math.floor(reservation.expiresAt/1000));
  items.forEach((i,n)=>{params["line_items["+n+"][price_data][currency]"]="mxn";params["line_items["+n+"][price_data][unit_amount]"]=String(i.p.price*100);params["line_items["+n+"][price_data][product_data][name]"]=i.name+" - surtido variado";params["line_items["+n+"][quantity]"]=String(i.quantity)});
  if(discount){try{await stripe("coupons/makeuppoint-online-5-mxn",{},"GET")}catch{try{await stripe("coupons",{id:"makeuppoint-online-5-mxn",percent_off:"5",duration:"forever",name:"MakeUpPoint online 5%"})}catch{await stripe("coupons/makeuppoint-online-5-mxn",{},"GET")}}params["discounts[0][coupon]"]="makeuppoint-online-5-mxn"}
  const cs=await stripe("checkout/sessions",params);createdSession=true;reservation.session=cs.id;
  await redis(["SET","mp:res:"+ref,JSON.stringify(reservation)]);
  return res.status(200).json({url:cs.url});
 }catch(e){
  if(createdSession){try{await stripe("checkout/sessions/"+reservation.session+"/expire",{})}catch{}}
  if(ref){try{await transitionReservation(ref,"released")}catch{}}
  console.error(e.message);return res.status(500).json({error:"No pudimos iniciar el pago. Intenta otra vez o cotiza por WhatsApp."});
 }
};
