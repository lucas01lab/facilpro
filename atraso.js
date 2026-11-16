/* FácilPro 4.2 — Juros simples de atraso (sem capitalização).
   Taxa configurada é percentual mensal, proporcional por dia (base 30).
   Usa taxa registrada na compra; alterações de configuração não são retroativas.
   Pagamentos liquidam juros vencidos primeiro e depois principal.
*/
(function(){
 'use strict';
 const cents=n=>Math.round((Number(n)+Number.EPSILON)*100);
 const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&!isNaN(Date.parse(s+'T12:00:00Z'));
 const day=s=>validDate(s)?Date.parse(s+'T12:00:00Z')/86400000:null;
 const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
 const total=v=>(v.itens||[]).reduce((s,i)=>s+cents(i.preco)*Number(i.quantidade),0);
 const config=(db)=>({ativo:db?.configAtraso?.ativo===true,taxa:Number(db?.configAtraso?.taxa)||0});
 function calc(v,asOf=today()){
  const original=total(v), rate=(v.jurosAtraso?.ativo===true && Number.isFinite(Number(v.jurosAtraso?.taxa)))?Math.max(0,Math.min(2,Number(v.jurosAtraso.taxa))):0;
  const due=day(v.vencimento),end=day(asOf), created=day(String(v.data||'').slice(0,10));
  let principal=Math.max(0,original),interest=0,interestTotal=0,daysLate=0;
  let from=due, paid=0;
  const payments=[...(Array.isArray(v.pagamentos)?v.pagamentos:[])].filter(p=>Number.isFinite(Number(p.valor))&&Number(p.valor)>=0).sort((a,b)=>String(a.data||'').localeCompare(String(b.data||'')));
  const accrue=to=>{
   if(due===null||to===null||from===null||to<=from||!rate||principal<=0)return;
   const start=Math.max(from,due),days=Math.max(0,to-start);
   if(days){const add=Math.round(principal*rate*days/3000);interest+=add;interestTotal+=add;daysLate+=days;}
   from=to;
  };
  for(const p of payments){const value=cents(p.valor);const when=day(String(p.data||'').slice(0,10));if(end!==null&&when!==null&&when>end)continue;
   if(when!==null)accrue(when);
   paid+=value;const toInterest=Math.min(interest,value);interest-=toInterest;
   principal=Math.max(0,principal-(value-toInterest));
  }
  if(end!==null)accrue(end);
  return {original,paid,principal,interest,interestTotal,outstanding:principal+interest,daysLate:due!==null&&end!==null?Math.max(0,end-due):0,rate};
 }
 window.FACILPRO_ATRASO={calc,config,today};
})();
