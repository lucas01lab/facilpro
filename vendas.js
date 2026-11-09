/* FácilPro — Vendas e Fiados na Agenda. Usa db e save() existentes. */
(function () {
  'use strict';
  const $v = key => document.getElementById(key);
  const cents = n => Math.round((Number(n) + Number.EPSILON) * 100);
  const asMoney = c => money(c / 100);
  const sum = list => list.reduce((total, n) => total + n, 0);
  let cart = [];
  const sales = () => { if (!Array.isArray(db.vendas)) db.vendas = []; return db.vendas; };
  const totalCents = v => sum((v.itens || []).map(i => cents(i.preco) * Number(i.quantidade)));
  const paidCents = v => sum((v.pagamentos || []).map(p => cents(p.valor)));
  const dueCents = v => Math.max(0, totalCents(v) - paidCents(v));
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
    sales().push({id:id(),cliente,data:new Date().toISOString(),vencimento:due,itens:cart.map(i=>({...i})),pagamentos:entry>0?[{id:id(),valor:Math.round(entry*100)/100,data:new Date().toISOString()}]:[]});
    cart=[];$v('fVenda').reset();renderCart();save();msg('Compra salva e saldo atualizado');
  }
  function payment(key) {
    const v=sales().find(x=>x.id===key);if(!v)return;
    const outstanding=dueCents(v);if(!outstanding)return alert('Essa compra já está quitada.');
    const raw=prompt('Valor recebido (R$). Saldo desta compra: '+asMoney(outstanding));
    if(raw===null)return;
    const value=Number(raw.trim().replace(/\s/g,'').replace(',','.'));
    if(!Number.isFinite(value)||value<=0||cents(value)>outstanding || cents(value)<1)return alert('Digite um pagamento positivo, de até '+asMoney(outstanding));
    if(!confirm('Confirmar recebimento de '+asMoney(cents(value))+'?'))return;
    (v.pagamentos ||= []).push({id:id(),valor:Math.round(value*100)/100,data:new Date().toISOString()});
    save();msg('Pagamento parcial registrado');
  }
  function receipt(clientKey) {
    const client=db.clientes.find(c=>c.id===clientKey);if(!client)return;
    const list=sales().filter(v=>v.cliente===clientKey).sort((a,b)=>a.data.localeCompare(b.data));
    const total=sum(list.map(totalCents)),paid=sum(list.map(paidCents));
    const lines=list.flatMap(v=>['',new Date(v.data).toLocaleDateString('pt-BR')+':',...(v.itens||[]).map(i=>`${i.quantidade}x ${i.nome} — ${asMoney(cents(i.preco)*i.quantidade)}`),`Total: ${asMoney(totalCents(v))} | Pago: ${asMoney(paidCents(v))}`]);
    const message=`Resumo de compras — ${client.nome}\n${lines.join('\n')}\n\nTotal comprado: ${asMoney(total)}\nTotal pago: ${asMoney(paid)}\nSaldo a pagar: ${asMoney(Math.max(0,total-paid))}`;
    let phone=(client.fone||'').replace(/\D/g,'');if(phone.length===10||phone.length===11)phone='55'+phone;
    window.open('https://wa.me/'+(phone.length>=12?phone:'')+'?text='+encodeURIComponent(message),'_blank','noopener');
  }
  function render() {
    if(!$v('vCliente'))return;
    const choice=$v('vCliente').value,prodChoice=$v('vProduto').value;
    $v('vCliente').innerHTML=opts(db.clientes);$v('vCliente').value=choice;
    $v('vProduto').innerHTML=opts(db.servicos);$v('vProduto').value=prodChoice;
    if(!prodChoice && db.servicos.length){$v('vProduto').value=db.servicos[0].id;currentProduct();}
    renderCart();
    const search=($v('vBusca').value||'').toLocaleLowerCase('pt-BR').trim();
    const groups=db.clientes.filter(c=>sales().some(v=>v.cliente===c.id) && c.nome.toLocaleLowerCase('pt-BR').includes(search));
    $v('vResumo').innerHTML=groups.map(c=>{
      const list=sales().filter(v=>v.cliente===c.id).sort((a,b)=>b.data.localeCompare(a.data));
      const all=sum(list.map(totalCents)),paid=sum(list.map(paidCents)),due=Math.max(0,all-paid);
      return `<article class="fiado-cliente"><h3>${esc(c.nome)}</h3><div class="fiado-line">${list.length} compra(s) · Total: <b>${asMoney(all)}</b> · Pago: ${asMoney(paid)}</div><div class="fiado-line ${due?'fiado-saldo':'fiado-pago'}">${due?'Em aberto: ':'Tudo pago: '}${asMoney(due)}</div><div class="actions"><button type="button" class="secondary" onclick="FACILPRO_VENDAS.compartilhar('${safeId(c.id)}')">Enviar resumo no WhatsApp</button></div><details><summary>Ver compras e pagamentos</summary>${list.map(v=>{
        const remaining=dueCents(v),dueDate=v.vencimento ? v.vencimento.split('-').reverse().join('/') : 'Sem vencimento';
        return `<div class="fiado-venda"><b>${new Date(v.data).toLocaleDateString('pt-BR')}</b> · ${remaining?'Fiado / parcial':'Quitada'}<div class="fiado-line">${(v.itens||[]).map(i=>`${esc(i.nome)} (${Number(i.quantidade)} × ${money(i.preco)})`).join('<br>')}</div><div class="fiado-line">Total: ${asMoney(totalCents(v))} · Pago: ${asMoney(paidCents(v))} · <strong>Saldo: ${asMoney(remaining)}</strong></div><div class="fiado-note">Vencimento: ${esc(dueDate)} · ${(v.pagamentos||[]).length} pagamento(s)</div>${remaining?`<button type="button" class="secondary" onclick="FACILPRO_VENDAS.pagar('${safeId(v.id)}')">+ Registrar pagamento</button>`:''}</div>`;
      }).join('')}</details></article>`;
    }).join('') || '<p class="muted">Nenhuma compra registrada para essa busca.</p>';
  }
  $v('vProduto').addEventListener('change',currentProduct);
  $v('vAdicionar').addEventListener('click',addProduct);
  $v('vBusca').addEventListener('input',render);
  $v('fVenda').addEventListener('submit',register);
  window.FACILPRO_VENDAS={render,pagar:payment,compartilhar:receipt,remover(index){cart.splice(index,1);renderCart();}};
  render();
})();
