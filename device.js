/* FácilPro — dois acessos por assinatura (instalações/perfis de navegador).
   Não equivale a identificação inviolável de hardware. */
(function(){
  'use strict';
  const key='facilpro_dispositivo_token_v1';
  function token(){
    let saved;
    try{saved=localStorage.getItem(key);}catch(_){throw new Error('Ative o armazenamento do navegador para usar o FácilPro.');}
    if(saved && /^[a-f0-9]{64}$/.test(saved))return saved;
    if(!window.crypto?.getRandomValues)throw new Error('Abra o FácilPro em uma conexão HTTPS segura.');
    const bytes=new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const created=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    try{localStorage.setItem(key,created);}catch(_){throw new Error('Não foi possível memorizar este aparelho. Desative o modo privado e tente novamente.');}
    return created;
  }
  function label(){
    const agent=navigator.userAgent||'';
    const mobile=/(Android|iPhone|Mobile)/i.test(agent);
    const browser=/Firefox/i.test(agent)?'Firefox':/Edg\//i.test(agent)?'Edge':/Chrome/i.test(agent)?'Chrome':/Safari/i.test(agent)?'Safari':'Navegador';
    return (mobile?'Celular':'Computador')+' · '+browser;
  }
  function friendly(error){
    const msg=error?.message||String(error||'');
    if(/LIMITE_2_DISPOSITIVOS/i.test(msg))return 'Esta conta já tem dois acessos registrados. Solicite ao administrador que desvincule um aparelho antigo.';
    if(/DISPOSITIVO_REVOGADO/i.test(msg))return 'O acesso deste navegador foi desvinculado pelo administrador. Solicite autorização para cadastrar um novo navegador.';
    if(/ASSINATURA_INATIVA/i.test(msg))return 'Sua mensalidade está pendente ou vencida.';
    if(/DISPOSITIVO_NAO_AUTORIZADO/i.test(msg))return 'Este navegador não está autorizado a acessar os dados na nuvem.';
    if(/TOKEN_DISPOSITIVO_INVALIDO/i.test(msg))return 'Não foi possível identificar este navegador. Confira o armazenamento e a conexão.';
    return 'Não foi possível validar o acesso deste navegador: '+msg;
  }
  window.FACILPRO_DEVICE={token,label,friendly};
})();
