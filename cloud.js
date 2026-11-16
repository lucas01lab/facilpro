/* FácilPro 4.1 — salvamento com revisão, RLS e recuperação local.
   Este arquivo não usa nenhuma chave secreta. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const blank = () => ({clientes:[], servicos:[], agenda:[], despesas:[], vendas:[], configAtraso:{ativo:false,taxa:0.5}});
  const fields = ['clientes','servicos','agenda','despesas','vendas'];
  const legacyFields = ['clientes','servicos','agenda','despesas'];
  const valid = obj => !!obj && legacyFields.every(k => Array.isArray(obj[k]));
  const normalize = obj => ({...Object.fromEntries(fields.map(k => [k,Array.isArray(obj?.[k]) ? obj[k] : []])), configAtraso: obj?.configAtraso && typeof obj.configAtraso==='object' ? {ativo:obj.configAtraso.ativo===true,taxa:Number(obj.configAtraso.taxa)||0} : {ativo:false,taxa:0.5}});
  const stable = v => JSON.stringify(v, function (k,x) {
    return x && !Array.isArray(x) && typeof x === 'object'
      ? Object.fromEntries(Object.entries(x).sort(([a],[b]) => a.localeCompare(b))) : x;
  });
  const identical = (a,b) => stable(normalize(a)) === stable(normalize(b));
  const hasData = obj => valid(obj) && fields.some(k => obj[k].length > 0);
  let session = null;
  let generation = 0;
  let timer = null;
  let queued = false;
  let monitor = null;
  let checking = false;

  function status(message, type='info', showRetry=false) {
    $('cloudState').textContent=message;
    $('cloudState').dataset.state=type;
    $('cloudRetry').hidden=!showRetry;
  }
  function overlay(message, options) {
    const modal=$('cloudDecision');
    $('cloudDecisionText').textContent=message;
    const actions=$('cloudDecisionActions');
    actions.replaceChildren();
    for(const option of options) {
      const btn=document.createElement('button');
      btn.type='button';
      btn.textContent=option.label;
      btn.className=option.primary?'primary':'secondary';
      btn.onclick=()=>{modal.hidden=true;option.action()};
      actions.appendChild(btn);
    }
    modal.hidden=false;
  }
  function dismiss() {$('cloudDecision').hidden=true;}
  function keepRecoveryCopy(s, data, label) {
    if(!valid(data) || !hasData(data)) return;
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    try {localStorage.setItem('facilpro_resgate_'+s.uid+'_'+label+'_'+stamp, JSON.stringify(data));}
    catch (_) {console.warn('Não foi possível manter uma cópia adicional. Exporte um backup JSON.');}
  }
  function marker(s) {
    try { localStorage.setItem('facilpro_sync_meta_'+s.uid, JSON.stringify({revision:s.revision, base:s.base})); }
    catch (_) {}
  }
  function updateLocal(s, next) {
    if (session!==s) return;
    const previous=s.get();
    if(!identical(previous,next)) keepRecoveryCopy(s,previous,'antes-da-nuvem');
    s.put(normalize(next));
    s.base=normalize(next);
    marker(s);
  }
  async function queryRemote(s) {
    const {data,error}=await s.client.from('facilpro_data')
      .select('payload, revision').eq('user_id',s.uid).maybeSingle();
    if(error) throw error;
    if(data && !valid(data.payload)) throw new Error('O backup na nuvem está em um formato inesperado.');
    return data ? {payload:normalize(data.payload), revision:Number(data.revision)} : {payload:blank(),revision:0};
  }
  function explainError(e) {
    if(/facilpro_data|relation .* does not exist|schema cache|PGRST205|PGRST116|42P01/i.test(e.message||''))
      return 'Banco ainda não configurado. Execute CONFIGURAR-SUPABASE.sql no SQL Editor.';
    if(/ASSINATURA_INATIVA/i.test(e.message||'')) return 'Sua mensalidade está pendente ou vencida. A sincronização foi bloqueada.';
    if(/LIMITE_1MB/i.test(e.message||'')) return 'O backup ultrapassou 1 MB. Exporte JSON e reduza os dados antes de tentar novamente.';
    if(!navigator.onLine || /Failed to fetch|fetch failed|NetworkError|Load failed/i.test(e.message||''))
      return 'Sem conexão com o Supabase. Dados salvos só neste aparelho por enquanto.';
    return 'Não foi possível sincronizar: '+(e.message||'erro desconhecido');
  }
  function failed(s,e) {
    if(session!==s)return;
    s.ready=false;
    status(explainError(e),'error',true);
  }
  function conflict(s, cloud, reason) {
    if(session!==s)return;
    s.ready=false;
    s.revision=cloud.revision;
    s.cloud=cloud.payload;
    status('Aguardando sincronização: dados diferentes. Escolha a versão a manter.','warn',false);
    overlay(reason+' Escolha qual cópia deve prevalecer. A versão substituída receberá uma cópia de resgate neste navegador. Se possível, exporte também um backup JSON antes.', [
      {label:'Usar dados da nuvem',primary:true,action:()=>{
        if(session!==s)return;
        updateLocal(s,s.cloud);
        s.base=normalize(s.cloud);
        marker(s);
        s.ready=true;
        status('Salvo na nuvem','ok');
      }},
      {label:'Enviar dados deste aparelho',action:()=>{
        if(session!==s)return;
        keepRecoveryCopy(s,s.cloud,'antes-de-substituir-nuvem');
        s.ready=true;
        s.base=normalize(s.cloud);
        marker(s);
        queued=true;
        flush();
      }}
    ]);
  }
  async function initialize(s) {
    if(session!==s)return;
    clearTimeout(timer);timer=null;
    s.ready=false;
    dismiss();
    status('Verificando dados da nuvem...');
    try {
      const remote=await queryRemote(s);
      if(session!==s)return;
      s.revision=remote.revision;
      s.cloud=remote.payload;
      const local=normalize(s.get());
      const base=s.base;
      if(identical(local,remote.payload)) {
        s.base=remote.payload;marker(s);s.ready=true;status('Salvo na nuvem','ok');
        return;
      }
      if(!hasData(local) && hasData(remote.payload)) {
        if(base===null || identical(local,base)) {
          updateLocal(s,remote.payload);s.ready=true;status('Salvo na nuvem · dados recebidos','ok');
        } else { conflict(s,remote,'Esta conta tem dados na nuvem, mas o cache local está vazio.'); }
        return;
      }
      if(remote.revision===0) {
        s.base=blank();marker(s);s.ready=true;queued=true;await flush();return;
      }
      if(base!==null && identical(local,base)) {
        updateLocal(s,remote.payload);s.ready=true;status('Salvo na nuvem · dados atualizados','ok');return;
      }
      if(base!==null && identical(remote.payload,base)) {
        s.base=remote.payload;marker(s);s.ready=true;queued=true;await flush();return;
      }
      conflict(s,remote, 'Foram encontradas alterações diferentes.');
    } catch(e) {failed(s,e);}
  }
  async function flush() {
    const s=session;
    if(!s || !s.ready || s.inFlight)return;
    clearTimeout(timer);timer=null;
    if(!queued && identical(s.get(),s.base)) {status('Salvo na nuvem','ok');return;}
    queued=false;
    const snapshot=normalize(s.get());
    if(identical(snapshot,s.base)) {status('Salvo na nuvem','ok');return;}
    s.inFlight=true;
    status('Salvando na nuvem...');
    try {
      const {data,error}=await s.client.rpc('facilpro_save',{
        p_expected_revision:s.revision,p_payload:snapshot
      });
      if(error)throw error;
      if(session!==s)return;
      if(!Array.isArray(data)||!data[0]||!Number.isFinite(Number(data[0].new_revision)))
        throw new Error('Resposta inesperada do banco.');
      const expectedRevision=Number(data[0].new_revision);
      // Um HTTP 200 na RPC não basta: ler novamente a versão gravada.
      const confirmed=await queryRemote(s);
      if(session!==s)return;
      if(confirmed.revision!==expectedRevision || !identical(confirmed.payload,snapshot)) {
        // Não sobrescreve alterações locais nem aceita uma confirmação ambígua.
        conflict(s,confirmed,'O servidor devolveu dados diferentes dos enviados.');
        return;
      }
      s.revision=confirmed.revision;
      s.base=confirmed.payload;
      marker(s);
      if(!identical(s.get(),snapshot))queued=true;
      status(queued?'Aguardando sincronização · novas alterações':'Salvo na nuvem',queued?'warn':'ok');
    } catch(e) {
      if(session!==s)return;
      if(/CONFLITO_REVISAO|P0001/.test(e.message||'')) {
        status('Outro dispositivo alterou os dados. Verificando...','warn');
        try {const remote=await queryRemote(s);if(session===s)conflict(s,remote,'Outro dispositivo salvou alterações antes deste.');}
        catch(err) {failed(s,err);}
      } else {failed(s,e);}
    } finally {
      s.inFlight=false;
      if(session===s && s.ready && queued) timer=setTimeout(flush,350);
    }
  }
  function start({client,user,get,put}) {
    stop();
    if(!user || !client)return;
    const uid=user.id;
    let meta=null;
    try {meta=JSON.parse(localStorage.getItem('facilpro_sync_meta_'+uid)||'null');}catch(_){}
    const s={uid,client,get,put,revision:0,cloud:null,
      base:meta && valid(meta.base) ? normalize(meta.base) : null,ready:false,inFlight:false,token:++generation};
    session=s;
    initialize(s);
    // Busca alterações remotas quando o app estiver em primeiro plano.
    // Nunca substitui dados locais pendentes: nesse caso, exige uma escolha.
    monitor=setInterval(()=>{if(!document.hidden)checkRemote(s);},30000);
  }
  function stop() {
    generation++;
    clearTimeout(timer);timer=null;
    clearInterval(monitor);monitor=null;checking=false;
    session=null;queued=false;
    dismiss();
    status('Aguardando login');
  }
  function changed() {
    const s=session;
    if(!s)return;
    queued=true;
    if(!s.ready) {status('Aguardando sincronização · alterações só neste aparelho','warn',true);return;}
    status('Aguardando sincronização · salvamento pendente','warn');
    clearTimeout(timer);
    timer=setTimeout(flush,650);
  }
  function retry() {
    const s=session;
    if(!s)return;
    if(s.inFlight) {status('Aguarde o salvamento terminar.');return;}
    if(s.ready){queued=true;flush();}
    else initialize(s);
  }
  window.FACILPRO_CLOUD={start,stop,changed,retry};
  $('cloudRetry').addEventListener('click',retry);
  window.addEventListener('online',()=>{if(session)retry()});
  async function checkRemote(s) {
    if(checking || session!==s || !s.ready || s.inFlight || queued || document.hidden)return;
    checking=true;
    try {
      const remote=await queryRemote(s);
      if(session!==s || !s.ready || s.inFlight || queued)return;
      if(remote.revision===s.revision)return;
      if(identical(s.get(),s.base)) {
        s.revision=remote.revision;
        updateLocal(s,remote.payload);
        status('Salvo na nuvem · atualizado de outro aparelho','ok');
      } else conflict(s,remote,'Outro aparelho alterou os dados e há mudanças locais.');
    } catch(e) {
      if(session===s) status('Erro ao sincronizar: '+explainError(e),'error',true);
    } finally {checking=false;}
  }
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden && session)checkRemote(session);
  });
})();
