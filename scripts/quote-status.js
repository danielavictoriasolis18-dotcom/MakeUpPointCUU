// Operator-only command. Credentials come from the environment, never the browser.
const {catalog,redis}=require('../lib/commerce');
async function main(){
  const [folio,action='ver']=process.argv.slice(2);
  if(!/^\d{1,12}$/.test(folio||'')||!['ver','vendido','no-vendido'].includes(action))throw Error('Uso: node scripts/quote-status.js FOLIO [ver|vendido|no-vendido]');
  const quoteKey='mp:quote:draft:'+folio,resKey='mp:res:'+folio;
  let raw=await redis(['GET',quoteKey]);
  if(!raw){
    const legacyRaw=await redis(['GET',resKey]);
    const legacy=legacyRaw&&JSON.parse(legacyRaw);
    if(!legacy||legacy.type!=='quote')throw Error('Folio no encontrado');
    if(legacy.session)throw Error('Este folio tiene un pago Stripe; revisar el pago antes de modificarlo');
    const quote={type:'quote',folio,status:legacy.status==='sold'?'sold':'pending',items:legacy.items};
    await redis(['SET',quoteKey,JSON.stringify(quote),'NX']);
    raw=await redis(['GET',quoteKey]);
  }
  const quote=JSON.parse(raw);
  if(action==='ver'){
    console.log(JSON.stringify({folio,status:quote.status||'pending',items:quote.items.map(i=>({name:i.name,quantity:i.quantity,price:i.price}))},null,2));
    return;
  }
  const keys=[quoteKey,resKey,'mp:pending',...quote.items.map(i=>'mp:stock:'+encodeURIComponent(i.name))];
  const seeds=quote.items.map(i=>i.stock??catalog.find(p=>p.name===i.name)?.stock??0);
  const lua=`
    local raw=redis.call('GET',KEYS[1]);if not raw then return 'missing' end
    local q=cjson.decode(raw);local target=ARGV[1]
    if q.status and q.status~='pending' then return q.status==target and 'already-'..target or 'conflict' end
    local old=redis.call('GET',KEYS[2])
    if old then
      local h=cjson.decode(old)
      if h.session then return 'stripe-payment' end
      if h.status=='sold' or h.status=='paid' then return 'legacy-sold' end
      if h.status=='pending' then
        for i,item in ipairs(h.items) do redis.call('INCRBY',KEYS[i+3],tonumber(item.quantity)) end
        h.status='released';redis.call('SET',KEYS[2],cjson.encode(h),'EX',604800)
        redis.call('ZREM',KEYS[3],ARGV[3])
      end
    end
    if target=='sold' then
      for i,item in ipairs(q.items) do
        local k=KEYS[i+3]
        if redis.call('EXISTS',k)==0 then redis.call('SET',k,ARGV[i+3]) end
        if tonumber(redis.call('GET',k))<tonumber(item.quantity) then return 'insufficient-stock' end
      end
      for i,item in ipairs(q.items) do redis.call('DECRBY',KEYS[i+3],tonumber(item.quantity)) end
    end
    q.status=target;q.resolvedAt=tonumber(ARGV[2]);q.type='quote'
    redis.call('SET',KEYS[1],cjson.encode(q));return target
  `;
  const result=await redis(['EVAL',lua,String(keys.length),...keys,action==='vendido'?'sold':'not-sold',String(Date.now()),folio,...seeds.map(String)]);
  if(!['sold','not-sold','already-sold','already-not-sold'].includes(result))throw Error('No se modificó la venta: '+result);
  console.log('Folio '+folio+': '+result);
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
