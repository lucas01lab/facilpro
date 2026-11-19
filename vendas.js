/* FácilPro — Vendas e Fiados na Agenda. Usa db e save() existentes. */
(function () {
  'use strict';
  const $v = key => document.getElementById(key);
  const cents = n => Math.round((Number(n) + Number.EPSILON) * 100);
  const asMoney = c => money(c / 100);
  const sum = list => list.reduce((total, n) => total + n, 0);
  let cart = [];
  const sales = () => { if (!Array.isArray(db.vendas)) db.vendas = []; return db.vendas; };
  // Never silently treat malformed historic purchases as zero or "paid".
  const invalidItems = v => !Array.isArray(v.itens) || !v.itens.length || v.itens.some(i =>
    !Number.isSafeInteger(Number(i.quantidade)) || Number(i.quantidade) < 1 ||
    i.quantidade == null || String(i.quantidade).trim() === '' ||
    !Number.isFinite(Number(i.preco)) || Number(i.preco) < 0
  );
  const totalCents = v => invalidItems(v) ? 0 : sum(v.itens.map(i => cents(i.preco) * Number(i.quantidade)));
  const paidCents = v => sum((Array.isArray(v.pagamentos) ? v.pagamentos : []).map(p =>
    Number.isFinite(Number(p.valor)) && Number(p.valor) >= 0 ? cents(p.valor) : 0));
  const late = v => window.FACILPRO_ATRASO.calc(v);
  const dueCents = v => late(v).outstanding;
  const safeId = s => String(s || '').replace(/[^a-zA-Z0-9_-]/g,'');

  function renderCart() {
    $v('vCarrinho').innerHTML = cart.map((i,index) => `<div class="fiado-cartrow"><span><b>${esc(i.nome)}</b><br><small>${i.quantidade} × ${money(i.preco)} = ${asMoney(cents(i.preco)*i.quantidade)}</small></span><button type="button" class="secondary danger" onclick="FACILPRO_VENDAS.remover(${index})">Remover</button></div>`).join('') || '<p class="muted">Adicione os produtos desta compra.</p>';
    $v('vTotal').textContent = 'Total da compra: ' + asMoney(sum(cart.map(i=>cents(i.preco)*i.quantidade)));
  }
  function currentProduct() {
    const found=db.servicos.find(s=>s.id===$v('vProduto').value);
    $v('vPreco').value=found ? Number(found.preco).toFixed(2) : '';
  }
  function addProduct() {
    const product=db.servicos.find(s=>s.id===$v('vProduto').value);
    const qty=Number($v('vQtd').value),price=Number($v('vPreco').value);
    if(!product)return alert('Escolha um produto cadastrado em Produtos e serviços.');
    if(!Number.isSafeInteger(qty)||qty<1||qty>100000)return alert('Informe uma quantidade válida.');
    if($v('vPreco').value===''||!Number.isFinite(price)||price<0||price>1000000)return alert('Informe um preço unitário válido.');
    if(sum(cart.map(i=>cents(i.preco)*i.quantidade))+cents(price)*qty>100000000)return alert('Compra acima do limite de R$ 1.000.000,00.');
    cart.push({id:product.id,nome:product.nome,quantidade:qty,preco:Math.round(price*100)/100});
    $v('vQtd').value='1';renderCart();
  }
  function register(e) {
    e.preventDefault();
    const cliente=$v('vCliente').value,entry=Number($v('vEntrada').value||0);
    if(!db.clientes.some(c=>c.id===cliente))return alert('Selecione um cliente cadastrado.');
    if(!cart.length)return alert('Adicione pelo menos um produto.');
    const amount=sum(cart.map(i=>cents(i.preco)*i.quantidade));
    if(!Number.isFinite(entry)||entry<0||cents(entry)>amount)return alert('O valor pago não pode ser negativo nem ultrapassar o total.');
    const due=$v('vVencimento').value;
    if(due && !/^\d{4}-\d{2}-\d{2}$/.test(due))return alert('Informe uma data de vencimento válida.');
    if(db.configAtraso?.ativo && cents(entry)<amount && !due)return alert('Informe o vencimento para uma venda fiada com juros ativados.');
    sales().push({id:id(),cliente,data:new Date().toISOString(),vencimento:due,itens:cart.map(i=>({...i})),pagamentos:entry>0?[{id:id(),valor:Math.round(entry*100)/100,data:new Date().toISOString()}]:[],jurosAtraso:{ativo:db.configAtraso?.ativo===true && cents(entry)<amount, taxa:Number(db.configAtraso?.taxa)||0}});
    cart=[];$v('fVenda').reset();renderCart();save();msg('Compra salva e saldo atualizado');
  }
  function payment(key) {
    const v=sales().find(x=>x.id===key);if(!v)return;
    if(invalidItems(v))return alert('Esta compra contém itens inválidos. Não registre pagamentos até corrigir os dados.');
    const outstanding=dueCents(v);if(!outstanding)return alert('Essa compra já está quitada.');
    const raw=prompt('Valor recebido (R$). Saldo desta compra: '+asMoney(outstanding));
    if(raw===null)return;
    const value=Number(raw.trim().replace(/\s/g,'').replace(',','.'));
    if(!Number.isFinite(value)||value<=0||cents(value)>outstanding || cents(value)<1)return alert('Digite um pagamento positivo, de até '+asMoney(outstanding));
    if(!confirm('Confirmar recebimento de '+asMoney(cents(value))+'?'))return;
    (v.pagamentos ||= []).push({id:id(),valor:Math.round(value*100)/100,data:new Date().toISOString()});
    save();msg('Pagamento parcial registrado');
  }
  function deleteSale(key) {
    const list=sales();
    const v=list.find(x=>x.id===key);
    if(!v)return alert('Compra não encontrada. Atualize a página e tente novamente.');
    const person=db.clientes.find(c=>c.id===v.cliente);
    const hasPayments=Array.isArray(v.pagamentos) && v.pagamentos.length>0;
    const summary=invalidItems(v)?'Registro com itens inconsistentes':
      'Total '+asMoney(totalCents(v))+'; saldo '+asMoney(dueCents(v));
    if(!confirm('Excluir permanentemente a compra de '+(person?.nome||'cliente')+'?\n'+summary+
      (hasPayments?'\nATENÇÃO: pagamentos registrados nesta compra também serão excluídos do histórico e do financeiro.':'')+
      '\nEssa operação não pode ser desfeita sem restaurar um backup.'))return;
    db.vendas=list.filter(x=>x.id!==key);
    save();
    msg('Compra excluída. Valores financeiros recalculados.');
  }
  let currentReceipt={message:'',phone:''};
  function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
  function ensureReceiptElements(){
    let modal=$v('receiptModal');
    if(!modal){
      modal=document.createElement('div');modal.id='receiptModal';modal.className='receipt-overlay';
      modal.innerHTML='<div class="receipt-panel"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h2>Comprovante profissional</h2><button type="button" class="secondary" id="receiptClose">Fechar</button></div><canvas id="receiptCanvas" class="receipt-preview" width="900" height="1200"></canvas><div class="receipt-actions"><button type="button" class="primary" id="receiptDownload">Baixar imagem</button><button type="button" class="secondary" id="receiptPDF">Salvar PDF</button><button type="button" class="secondary" id="receiptWhats">WhatsApp</button></div></div>';
      document.body.appendChild(modal);
      modal.querySelector('#receiptClose').onclick=()=>{modal.hidden=true;};
      modal.querySelector('#receiptDownload').onclick=downloadReceipt;
      modal.querySelector('#receiptPDF').onclick=printReceipt;
      modal.querySelector('#receiptWhats').onclick=sendReceipt;
    }
    let canvas=modal.querySelector('#receiptCanvas');
    if(!canvas){canvas=document.createElement('canvas');canvas.id='receiptCanvas';canvas.className='receipt-preview';canvas.width=900;canvas.height=1200;modal.querySelector('.receipt-panel')?.appendChild(canvas);}
    return {modal,canvas};
  }
  function receipt(clientKey) {
    const client=db.clientes.find(c=>c.id===clientKey);if(!client)return;
    const receiptUI=ensureReceiptElements();
    const list=sales().filter(v=>v.cliente===clientKey).sort((a,b)=>a.data.localeCompare(b.data));
    const valid=list.filter(v=>!invalidItems(v));
    const total=sum(valid.map(totalCents)),paid=sum(valid.map(paidCents)),due=sum(valid.map(dueCents));
    const canvas=receiptUI.canvas,ctx=canvas.getContext('2d');if(!ctx){alert('Seu navegador não conseguiu preparar o comprovante. Atualize a página e tente novamente.');return;}
    canvas.width=900;canvas.height=Math.max(1120,430+valid.reduce((n,v)=>n+100+(v.itens||[]).length*42,0));
    ctx.fillStyle='#f1f5f9';ctx.fillRect(0,0,900,canvas.height);
    ctx.fillStyle='#14243b';ctx.fillRect(0,0,900,245);
    ctx.fillStyle='#22c55e';ctx.beginPath();ctx.arc(790,85,105,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#fff';ctx.font='bold 56px Arial';ctx.fillText('FácilPro',60,100);
    ctx.font='26px Arial';ctx.fillText('SEU NEGÓCIO ORGANIZADO',62,150);
    ctx.font='bold 34px Arial';ctx.fillText('COMPROVANTE DE COMPRAS',60,215);
    let y=315;ctx.fillStyle='#fff';roundRect(ctx,45,y,810,125,22);ctx.fill();
    ctx.fillStyle='#64748b';ctx.font='22px Arial';ctx.fillText('CLIENTE',75,y+42);
    ctx.fillStyle='#14243b';ctx.font='bold 34px Arial';ctx.fillText(String(client.nome||'Cliente').slice(0,35),75,y+88);
    y+=165;
    for(const v of valid){
      ctx.fillStyle='#fff';roundRect(ctx,45,y,810,95+(v.itens||[]).length*42,18);ctx.fill();
      ctx.fillStyle='#2563eb';ctx.font='bold 24px Arial';ctx.fillText(new Date(v.data).toLocaleDateString('pt-BR')+(v.vencimento?' · Vencimento '+v.vencimento.split('-').reverse().join('/') :''),75,y+40);
      let iy=y+82;ctx.fillStyle='#334155';ctx.font='22px Arial';
      for(const item of v.itens||[]){ctx.fillText(`${item.quantidade} × ${String(item.nome).slice(0,34)}`,75,iy);ctx.textAlign='right';ctx.fillText(asMoney(cents(item.preco)*item.quantidade),820,iy);ctx.textAlign='left';iy+=42;}
      ctx.fillStyle='#64748b';ctx.font='bold 21px Arial';ctx.fillText('Total '+asMoney(totalCents(v))+'  ·  Pago '+asMoney(paidCents(v)),75,iy+8);y=iy+55;
    }
    y+=10;ctx.fillStyle='#14243b';roundRect(ctx,45,y,810,235,22);ctx.fill();
    ctx.fillStyle='#cbd5e1';ctx.font='24px Arial';ctx.fillText('RESUMO FINANCEIRO',75,y+48);
    ctx.fillStyle='#fff';ctx.font='26px Arial';ctx.fillText('Total comprado',75,y+100);ctx.textAlign='right';ctx.fillText(asMoney(total),820,y+100);
    ctx.textAlign='left';ctx.fillText('Total pago',75,y+150);ctx.textAlign='right';ctx.fillStyle='#86efac';ctx.fillText(asMoney(paid),820,y+150);
    ctx.textAlign='left';ctx.fillStyle='#fff';ctx.font='bold 30px Arial';ctx.fillText('Saldo em aberto',75,y+205);ctx.textAlign='right';ctx.fillStyle='#fca5a5';ctx.fillText(asMoney(due),820,y+205);ctx.textAlign='left';
    y+=285;ctx.fillStyle='#64748b';ctx.font='22px Arial';ctx.textAlign='center';ctx.fillText('Obrigado pela preferência!',450,y);ctx.font='18px Arial';ctx.fillText('Comprovante gerado pelo FácilPro · '+new Date().toLocaleString('pt-BR'),450,y+35);ctx.textAlign='left';
    const lines=valid.flatMap(v=>['',new Date(v.data).toLocaleDateString('pt-BR')+':',...(v.itens||[]).map(i=>`${i.quantidade}x ${i.nome} — ${asMoney(cents(i.preco)*i.quantidade)}`),`Total: ${asMoney(totalCents(v))} | Pago: ${asMoney(paidCents(v))}`]);
    const message=`Comprovante FácilPro — ${client.nome}\n${lines.join('\n')}\n\nTotal comprado: ${asMoney(total)}\nTotal pago: ${asMoney(paid)}\nSaldo em aberto (incluindo juros aplicáveis): ${asMoney(due)}`;
    let phone=(client.fone||'').replace(/\D/g,'');if(phone.length===10||phone.length===11)phone='55'+phone;
    currentReceipt={message,phone:phone.length>=12?phone:''};receiptUI.modal.hidden=false;
  }
  function downloadReceipt(){const canvas=$v('receiptCanvas');if(!canvas){alert('Gere o comprovante primeiro.');return;}canvas.toBlob(blob=>{if(!blob)return alert('Não foi possível gerar a imagem.');const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='comprovante-facilpro.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);},'image/png');}
  function printReceipt(){const canvas=$v('receiptCanvas');if(!canvas){alert('Gere o comprovante primeiro.');return;}const data=canvas.toDataURL('image/png'),w=window.open('','_blank');if(!w)return alert('Permita janelas pop-up para salvar o PDF.');w.document.write(`<html><head><title>Comprovante FácilPro</title><style>body{margin:0;text-align:center}img{width:100%;max-width:750px}@media print{img{max-width:100%}}</style></head><body><img src="${data}"><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();}
  function sendReceipt(){const url='https://wa.me/'+currentReceipt.phone+'?text='+encodeURIComponent(currentReceipt.message);window.open(url,'_blank','noopener');}

  let lastRateKey=null;
  function render() {
    if(!$v('vCliente'))return;
    const rateKey=JSON.stringify(window.FACILPRO_ATRASO.config(db));
    if(rateKey!==lastRateKey){renderRate();lastRateKey=rateKey;}
    const choice=$v('vCliente').value,prodChoice=$v('vProduto').value;
    $v('vCliente').innerHTML=opts(db.clientes);$v('vCliente').value=choice;
    $v('vProduto').innerHTML=opts(db.servicos);$v('vProduto').value=prodChoice;
    if(!prodChoice && db.servicos.length){$v('vProduto').value=db.servicos[0].id;currentProduct();}
    renderCart();
    const search=($v('vBusca').value||'').toLocaleLowerCase('pt-BR').trim();
    const groups=db.clientes.filter(c=>sales().some(v=>v.cliente===c.id) && c.nome.toLocaleLowerCase('pt-BR').includes(search));
    $v('vResumo').innerHTML=groups.map(c=>{
      const list=sales().filter(v=>v.cliente===c.id).sort((a,b)=>b.data.localeCompare(a.data));
      const valid=list.filter(v=>!invalidItems(v));
      const badCount=list.length-valid.length;
      const all=sum(valid.map(totalCents)),paid=sum(valid.map(paidCents)),due=sum(valid.map(dueCents)),juros=sum(valid.map(v=>late(v).interest));
      return `<article class="fiado-cliente"><h3>${esc(c.nome)}</h3><div class="fiado-line">${list.length} compra(s) · Total válido: <b>${asMoney(all)}</b> · Pago: ${asMoney(paid)}</div>${juros?`<div class="fiado-line">Juros pendentes: <b>${asMoney(juros)}</b></div>`:''}<div class="fiado-line ${due?'fiado-saldo':'fiado-pago'}">${due?'Em aberto: ':'Saldo em aberto: '}${asMoney(due)}</div>${badCount?`<p class="fiado-note" style="color:#b91c1c"><b>Atenção:</b> ${badCount} compra(s) com dados inconsistentes, fora dos totais acima. Confira ou exclua apenas os registros errados.</p>`:''}<div class="actions"><button type="button" class="secondary" onclick="FACILPRO_VENDAS.compartilhar('${safeId(c.id)}')">Gerar comprovante profissional</button></div><details><summary>Ver compras e pagamentos</summary>${list.map(v=>{
        const broken=invalidItems(v);
        const info=broken?null:late(v);
        const remaining=broken?0:dueCents(v),dueDate=v.vencimento ? v.vencimento.split('-').reverse().join('/') : 'Sem vencimento';
        const items=(v.itens||[]).map(i=>`${esc(i.nome||'Produto não identificado')} (${broken && (!Number.isSafeInteger(Number(i.quantidade)) || i.quantidade==null)?'quantidade inválida':esc(i.quantidade)} × ${money(i.preco)})`).join('<br>');
        const details=broken?'<div class="fiado-line" style="color:#b91c1c"><b>Registro inconsistente: quantidade/preço inválido. Não contado no resumo.</b></div>':`<div class="fiado-line">Total: ${asMoney(totalCents(v))} · Pago: ${asMoney(paidCents(v))} · <strong>Saldo: ${asMoney(remaining)}</strong>${info.interest?`<br>Juros em aberto: ${asMoney(info.interest)} · ${info.daysLate} dia(s) de atraso · ${info.rate}% ao mês`:''}</div>`;
        return `<div class="fiado-venda"><b>${esc(new Date(v.data).toLocaleDateString('pt-BR'))}</b> · ${broken?'Revisar dados':remaining?'Fiado / parcial':'Quitada'}<div class="fiado-line">${items}</div>${details}<div class="fiado-note">Vencimento: ${esc(dueDate)} · ${(v.pagamentos||[]).length} pagamento(s)</div>${!broken&&remaining?`<button type="button" class="secondary" onclick="FACILPRO_VENDAS.pagar('${safeId(v.id)}')">+ Registrar pagamento</button>`:''}<button type="button" class="secondary danger" onclick="FACILPRO_VENDAS.excluir('${safeId(v.id)}')">Excluir compra</button></div>`;
      }).join('')}</details></article>`;
    }).join('') || '<p class="muted">Nenhuma compra registrada para essa busca.</p>';
  }
  function renderRate(){
    const c=window.FACILPRO_ATRASO.config(db),field=$v('jurosTaxa');
    $v('jurosAtivo').checked=c.ativo;
    field.value=['0.5','1','2'].includes(String(c.taxa))?String(c.taxa):'custom';
    $v('jurosOutro').value=String(c.taxa);
    $v('jurosOutroBox').hidden=field.value!=='custom';
    $v('jurosEstado').textContent=c.ativo?'Ativo: '+c.taxa.toLocaleString('pt-BR')+'% ao mês para novas vendas.':'Desativado: novas vendas sem juros automáticos.';
  }
  $v('jurosTaxa').addEventListener('change',()=>{$v('jurosOutroBox').hidden=$v('jurosTaxa').value!=='custom';});
  $v('fAtraso').addEventListener('submit',e=>{
    e.preventDefault(); const select=$v('jurosTaxa').value;
    const rate=Number(select==='custom'?$v('jurosOutro').value:select);
    if(!Number.isFinite(rate)||rate<0||rate>2|| (select==='custom' && $v('jurosOutro').value===''))return alert('Informe uma taxa entre 0 e 2% ao mês.');
    db.configAtraso={ativo:$v('jurosAtivo').checked,taxa:rate};
    save();renderRate();msg('Taxa padrão salva para novas vendas.');
  });
  $v('vProduto').addEventListener('change',currentProduct);
  $v('vAdicionar').addEventListener('click',addProduct);
  $v('vBusca').addEventListener('input',render);
  $v('fVenda').addEventListener('submit',register);
  window.FACILPRO_VENDAS={render,pagar:payment,excluir:deleteSale,compartilhar:receipt,fecharComprovante(){ const m=$v('receiptModal');if(m)m.hidden=true; },baixarImagem:downloadReceipt,salvarPDF:printReceipt,whatsapp:sendReceipt,remover(index){cart.splice(index,1);renderCart();}};
  render();
})();
