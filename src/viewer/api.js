// Cliente do servidor do ID3D (modelos e anexos). Sem servidor (HTML aberto direto do
// disco), ping() devolve null e o visualizador segue funcionando sem anexos.

const HEADERS = { 'X-ID3D': '1' };

async function resposta(r) {
  let corpo = null;
  try { corpo = await r.json(); } catch { /* resposta sem JSON */ }
  if (!r.ok) throw new Error((corpo && corpo.erro) || 'O servidor não respondeu como esperado (' + r.status + ').');
  return corpo;
}
async function pedir(url, opcoes) {
  let r;
  try { r = await fetch(url, opcoes); }
  catch { throw new Error('Sem conexão com o servidor do ID3D.'); }
  return resposta(r);
}

export async function ping() {
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return null;
  try {
    const r = await fetch('api/estado', { cache: 'no-store' });
    if (!r.ok) return null;
    const estado = await r.json();
    return estado && estado.anexos ? estado : null;
  } catch { return null; }
}

export async function listarModelos() {
  return (await pedir('api/modelos', { cache: 'no-store' })).modelos;
}

export async function baixarModelo(url) {
  let r;
  try { r = await fetch(url, { cache: 'no-store' }); }
  catch { throw new Error('Sem conexão com o servidor do ID3D.'); }
  if (!r.ok) throw new Error('Não foi possível baixar o modelo do servidor.');
  return new Uint8Array(await r.arrayBuffer());
}

export async function listarAnexos(modelo) {
  return (await pedir('api/anexos/' + modelo, { cache: 'no-store' })).anexos;
}

export async function enviarAnexo(modelo, parte, caminho, file) {
  const q = new URLSearchParams({ parte: parte, caminho: caminho, nome: file.name });
  const corpo = await pedir('api/anexos/' + modelo + '?' + q, {
    method: 'POST', body: file, headers: Object.assign({ 'Content-Type': file.type || 'application/octet-stream' }, HEADERS),
  });
  return corpo.anexo;
}

export async function atualizarAnexo(modelo, id, dados) {
  const corpo = await pedir('api/anexos/' + modelo + '/' + id, {
    method: 'PATCH', body: JSON.stringify(dados), headers: Object.assign({ 'Content-Type': 'application/json' }, HEADERS),
  });
  return corpo.anexo;
}

export async function removerAnexo(modelo, id) {
  await pedir('api/anexos/' + modelo + '/' + id, { method: 'DELETE', headers: HEADERS });
}

export function urlDoAnexo(modelo, id, baixar) {
  return 'api/anexos/' + modelo + '/' + id + '/arquivo' + (baixar ? '?baixar=1' : '');
}
