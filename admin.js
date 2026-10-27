/* FácilPro: gerenciamento exclusivo, validado por funções do Supabase. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const cfg = window.FACILPRO_CONFIG || {};
  let api, user = null, entries = [], busy = false;
  const say = (text, kind='') => { $('status').textContent=text; $('status').className=kind; };
  const authView = () => { $('sessionArea').hidden=true; $('loginArea').hidden=false; };
  const fmtDate = d => d ? new Date(d).toLocaleString('pt-BR', {dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}) : 'Não definido';
  const currentState = row => {
    if (row.status==='blocked') return ['blocked','Bloqueada'];
    if (row.status==='active' && row.expires_at && Date.parse(row.expires_at)>Date.now()) return ['active','Ativa'];
    if (row.status==='active') return ['expired','Vencida'];
    return ['pending','Pendente'];
  };
  function showCounters() {
    const counts={active:0,pending:0,blocked:0,expired:0};
    entries.forEach(r=>counts[currentState(r)[0]]++);
    $('countActive').textContent=counts.active;
    $('countPending').textContent=counts.pending;
    $('countBlocked').textContent=counts.blocked+counts.expired;
  }
  const span=(cls, value)=>{const a=document.createElement('span');a.className=cls;a.textContent=value;return a};
  function render() {
    showCounters();
    const needle=$('filter').value.toLocaleLowerCase('pt-BR').trim();
    const rows=entries.filter(x=>(x.email||'').toLocaleLowerCase('pt-BR').includes(needle));
    $('countShown').textContent=rows.length+' conta(s)';
    const out=$('members');out.replaceChildren();$('membersEmpty').hidden=rows.length>0;
    for(const row of rows){
      const item=document.createElement('div');item.className='member';
      const info=document.createElement('div');
      const title=document.createElement('div');title.className='member-name';title.textContent=row.email||'(sem e-mail)';info.append(title);
      const state=currentState(row);info.append(span('badge '+state[0],state[1]));
      const meta=document.createElement('div');meta.className='member-meta';
      meta.textContent='Vencimento: '+fmtDate(row.expires_at);
      info.append(meta);item.append(info);
      const actions=document.createElement('div');actions.className='member-actions';
      const renew=document.createElement('button');renew.className='primary';renew.textContent='Renovar +30 dias';renew.disabled=busy;
      renew.onclick=()=>change(row,'renovar');actions.append(renew);
      if(state[0]!=='blocked'){
        const block=document.createElement('button');block.className='danger';block.textContent='Bloquear';block.disabled=busy;
        block.onclick=()=>change(row,'bloquear');actions.append(block);
      }
      const devices=document.createElement('button');devices.className='secondary';devices.textContent='Gerenciar acessos';devices.disabled=busy;
      devices.onclick=()=>openDevices(row);actions.append(devices);
      item.append(actions);out.append(item);
    }
  }
  const fmtAccess = time => time ? fmtDate(time) : '—';
  async function openDevices(row) {
    $('devicesArea').hidden=false;
    $('devicesOwner').textContent='Conta: '+(row.email||'(sem e-mail)');
    $('deviceRows').replaceChildren();
    $('devicesMessage').textContent='Carregando acessos...';
    $('devicesArea').dataset.user=row.user_id;
    $('devicesArea').dataset.email=row.email||'';
    $('devicesArea').scrollIntoView({behavior:'smooth',block:'start'});
    try {
      const {data,error}=await api.rpc('facilpro_admin_dispositivos',{p_user_id:row.user_id});
      if(error)throw error;
      if($('devicesArea').dataset.user!==row.user_id)return;
      const rows=Array.isArray(data)?data:[];
      $('devicesMessage').textContent=rows.length+' de 2 acessos utilizados.';
      for(const access of rows){
        const item=document.createElement('div');item.className='member';
        const info=document.createElement('div');
        info.append(span('member-name',access.nome||'Navegador'));
        const details=document.createElement('div');details.className='member-meta';
        details.textContent='Registrado: '+fmtAccess(access.created_at)+' · Última validação: '+fmtAccess(access.last_seen_at);
        info.append(details);item.append(info);
        const btn=document.createElement('button');btn.className='danger';btn.type='button';btn.textContent='Desvincular';
        btn.onclick=async()=>{
          if(!window.confirm('Desvincular este acesso de '+(row.email||'esta conta')+'? O navegador antigo perderá autorização e abrirá uma vaga.'))return;
          btn.disabled=true;
          const {error:err}=await api.rpc('facilpro_admin_desvincular_dispositivo',{
            p_user_id:row.user_id,p_token_hash:access.token_hash
          });
          if(err){$('devicesMessage').textContent='Erro: '+err.message;btn.disabled=false;return;}
          await openDevices(row);
        };
        item.append(btn);$('deviceRows').append(item);
      }
    }catch(e){$('devicesMessage').textContent='Não foi possível consultar os aparelhos: '+(e.message||'erro desconhecido');}
  }
  $('closeDevices').onclick=()=>{$('devicesArea').hidden=true;$('devicesArea').dataset.user=''};
  async function load() {
    if(!user)return;
    say('Carregando empreendedores...');
    const {data,error}=await api.rpc('facilpro_admin_listar');
    if(error){say('Não foi possível listar as contas: '+error.message,'error');return;}
    entries=Array.isArray(data)?data:[];
    render();say('Dados atualizados. A renovação precisa ser confirmada por você.','ok');
  }
  async function change(row,action) {
    if(busy||!user)return;
    const question=action==='renovar'
      ? 'Confirmou o pagamento de '+row.email+'? Isto acrescentará 30 dias ao prazo restante, se houver.'
      : 'Bloquear o acesso de '+row.email+'? Esta ação suspenderá a assinatura.';
    if(!window.confirm(question))return;
    busy=true;render();say('Aplicando alteração...');
    try {
      const {error}=await api.rpc('facilpro_admin_mudar',{p_user_id:row.user_id,p_acao:action});
      if(error)throw error;
      await load();
      say(action==='renovar'?'Mensalidade renovada no Supabase.':'Assinatura bloqueada no Supabase.','ok');
    } catch(e){say('Falha ao alterar mensalidade: '+(e.message||'erro desconhecido'),'error');}
    finally {busy=false;render();}
  }
  async function check() {
    try {
      const {data:{user:me},error}=await api.auth.getUser();
      if(error||!me) {user=null;authView();return;}
      const {data,isError,error:checkError}=await api.rpc('facilpro_admin_eu');
      if(checkError||data!==true){user=null;authView();say('Esta conta não está autorizada a administrar o FácilPro.','error');return;}
      user=me;
      $('loginArea').hidden=true;$('sessionArea').hidden=false;
      $('loggedEmail').textContent=me.email||'Administrador conectado';
      await load();
    }catch(e){authView();say('Erro ao verificar administrador: '+e.message,'error');}
  }
  $('loginForm').onsubmit=async e=>{
    e.preventDefault();const email=$('email').value.trim(),password=$('password').value;
    const b=$('loginForm').querySelector('button');b.disabled=true;say('Verificando login...');
    try {
      const {error}=await api.auth.signInWithPassword({email,password});
      if(error)throw error;
      $('password').value='';await check();
    }catch(e){say(e.message||'Falha ao entrar.','error');}
    finally{b.disabled=false;}
  };
  $('logout').onclick=async()=>{const {error}=await api.auth.signOut();if(error)say(error.message,'error');else{user=null;entries=[];authView();say('Você saiu do painel.','ok');}};
  $('refresh').onclick=()=>load();$('filter').oninput=()=>render();
  if(!cfg.url||!cfg.anonKey||!window.supabase){say('Falta a configuração pública do Supabase ou conexão com a internet.','error');return;}
  api=window.supabase.createClient(cfg.url,cfg.anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  check();
})();
