// Cliente mínimo da API do Gemini (Google AI Studio), chamado direto do navegador.
// A chave é do próprio usuário e fica só neste aparelho (localStorage).

import { t } from '../i18n.js';
import { AiError, store, call as httpCall, wait, transient } from './http.js';

export { AiError };
export const API = 'https://generativelanguage.googleapis.com/v1beta';
export const DEFAULT_MODEL = 'gemini-flash-latest';

const KEY = 'gemini-key';
const MODEL = 'gemini-model';

export const id = 'gemini';
export const label = 'Gemini (Google)';
export const service = 'Gemini';
export const keyUrl = 'https://aistudio.google.com/apikey';
export const keySteps = 'toque em <b>Create API key</b>';
export const keyPlaceholder = 'Chave do Gemini (AIza…)';
export const privacy = 'No plano grátis, o Google pode usar o que recebe para melhorar os produtos dele.';
/** Contexto grande: cabe a equipe + boa parte do PC. */
export const maxCandidates = 250;

export const getKey = () => store.get(KEY);
export const setKey = v => store.set(KEY, (v || '').trim());
export const getModel = () => store.get(MODEL) || DEFAULT_MODEL;
export const setModel = v => store.set(MODEL, (v || '').trim().replace(/^models\//, ''));

const call = (url, init, fetchImpl) => httpCall(url, init, fetchImpl, service);

/** Traduz a resposta de erro da API numa mensagem para o usuário. */
export function errorMessage(status, body) {
  const e = body && body.error ? body.error : {};
  const reason = (e.details || []).map(d => d.reason).find(Boolean) || '';
  const msg = String(e.message || '');
  if (reason === 'API_KEY_INVALID' || /API key not valid/i.test(msg)) return new AiError(t('A chave do Gemini não é válida. Confira se copiou a chave inteira.'), 'key');
  if (status === 403) return new AiError(t('A chave não tem permissão para usar o Gemini. Crie uma chave nova no Google AI Studio.'), 'key');
  if (status === 429 && quotaKind(body) === 'day') return new AiError(t('A cota grátis de hoje do Gemini acabou (também nos modelos Lite). Ela volta no dia seguinte.'), 'quota');
  if (status === 429) return new AiError(t('Limite do plano grátis do Gemini atingido. Espere um minuto e tente de novo.'), 'quota');
  if (status === 404) return new AiError(t('O modelo não foi encontrado ({msg}).', { msg: msg || t('erro {status}', { status: 404 }) }), 'model');
  if (status >= 500) return new AiError(t('O Gemini está sobrecarregado ou fora do ar. Tente de novo daqui a pouco. ({detail})', { detail: `${status}${msg ? ': ' + msg : ''}` }), 'server');
  return new AiError(t('O Gemini recusou o pedido ({detail}).', { detail: `${status}${msg ? ': ' + msg : ''}` }), 'other');
}

/**
 * Que cota acabou num erro 429: 'day' (pedidos por dia), 'minute' (por minuto) ou null (não diz).
 * O Google manda em `details` um QuotaFailure com o quotaId, ex.: GenerateRequestsPerDayPerProjectPerModel-FreeTier.
 */
export function quotaKind(body) {
  const e = body && body.error ? body.error : {};
  const ids = (e.details || []).flatMap(d => (d.violations || []).map(v => String(v.quotaId || '')));
  if (ids.some(id => /PerDay/i.test(id))) return 'day';
  if (ids.some(id => /PerMinute/i.test(id))) return 'minute';
  return null;
}

/** Modelos cuja cota do dia acabou nesta visita: os próximos pedidos vão direto para um Lite. */
const outOfQuota = new Set();
export const resetQuota = () => outOfQuota.clear();

/**
 * Modelos "flash" disponíveis para a chave, na ordem de preferência:
 * estáveis, depois "lite" (mais leves, costumam estar menos disputados), depois "preview".
 * Dentro de cada grupo, a maior versão primeiro (ex.: gemini-3-flash antes de gemini-2.5-flash).
 */
export async function listFlashModels(key, fetchImpl = (...a) => fetch(...a)) {
  const res = await call(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } }, fetchImpl);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw errorMessage(res.status, body);
  const names = (body.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace(/^models\//, ''))
    .filter(n => /^gemini-.*flash/.test(n) && !/image|tts|audio|live|exp|latest|thinking/.test(n));
  const tier = n => (/preview/.test(n) ? 2 : /lite/.test(n) ? 1 : 0);
  const ver = n => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
  return names.sort((a, b) => tier(a) - tier(b) || ver(b) - ver(a) || a.length - b.length);
}

export const listModels = listFlashModels;

/** Reservas para sobrecarga: o melhor de cada grupo (estável, lite, preview) primeiro, depois os demais. */
export function fallbackOrder(names) {
  const tier = n => (/preview/.test(n) ? 2 : /lite/.test(n) ? 1 : 0);
  const heads = [0, 1, 2].map(t => names.find(n => tier(n) === t)).filter(Boolean);
  return [...heads, ...names.filter(n => !heads.includes(n))];
}

/** Escolhe um modelo "flash" disponível para a chave (quando o padrão não existe mais). */
export async function pickModel(key, fetchImpl = (...a) => fetch(...a), exclude = []) {
  const name = (await listFlashModels(key, fetchImpl)).find(n => !exclude.includes(n));
  if (!name) throw new AiError(t('Não encontrei um modelo Gemini Flash disponível para esta chave.'), 'model');
  return name;
}


async function request({ system, prompt, schema, key, model, fetchImpl }) {
  const res = await call(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.4 },
    }),
  }, fetchImpl);
  return { status: res.status, ok: res.ok, body: await res.json().catch(() => null) };
}

/**
 * Gera uma resposta em JSON seguindo `schema`.
 * Modelo inexistente (404): troca por outro "flash" e guarda a escolha.
 * Sobrecarga/erro interno (5xx): tenta de novo e depois até 3 outros modelos "flash" (sem guardar).
 * Cota do dia esgotada (429 que não é só por minuto): tenta até 2 modelos Lite, que têm cota própria (bem maior).
 * @returns {Promise<{ data: object, model: string, fallback: false|'overload'|'quota' }>} fallback = veio de outro
 *   modelo, e por quê (sobrecarga ou cota do dia)
 */
export async function generateJSON({ system, prompt, schema, key = getKey(), model = getModel(), fetchImpl = (...a) => fetch(...a), sleep = wait }) {
  if (!key) throw new AiError(t('Cole sua chave do Gemini primeiro.'), 'key');
  const args = { system, prompt, schema, key, fetchImpl };
  const tried = [model];
  let fallback = false; // a resposta veio de outro modelo: 'overload' (sobrecarga) ou 'quota' (cota do dia)
  // Cota do dia já esgotada neste modelo: nem tenta (o 429 voltaria na hora)
  let r = outOfQuota.has(model) ? { status: 429, ok: false, body: null } : await request({ ...args, model });
  if (r.status === 404) {
    model = await pickModel(key, fetchImpl, tried);
    setModel(model);
    tried.push(model);
    r = await request({ ...args, model });
  }
  if (transient(r.status)) {
    await sleep(2000);
    r = await request({ ...args, model });
  }
  if (transient(r.status)) {
    let others = [];
    try { others = fallbackOrder((await listFlashModels(key, fetchImpl)).filter(n => !tried.includes(n))).slice(0, 3); } catch { /* fica com o erro original */ }
    for (const other of others) {
      tried.push(other);
      const r2 = await request({ ...args, model: other });
      if (r2.ok || !transient(r2.status)) { r = r2; model = other; fallback = 'overload'; break; }
    }
  }
  if (r.status === 429 && quotaKind(r.body) !== 'minute') {
    if (quotaKind(r.body) === 'day') outOfQuota.add(model); // só guarda quando o Google diz que é a cota do dia
    let lites = [];
    try { lites = (await listFlashModels(key, fetchImpl)).filter(n => /lite/.test(n) && !tried.includes(n) && !outOfQuota.has(n)).slice(0, 2); } catch { /* fica com o erro original */ }
    for (const other of lites) {
      tried.push(other);
      const r2 = await request({ ...args, model: other });
      if (r2.ok) { r = r2; model = other; fallback = 'quota'; break; }
      if (r2.status === 429) { if (quotaKind(r2.body) === 'day') outOfQuota.add(other); r = r2; continue; }
      if (!transient(r2.status)) { r = r2; break; }
    }
    // Todos sem cota: a mensagem é a da cota do dia, mesmo que o último erro não diga qual cota foi
    if (!r.ok && r.status === 429 && quotaKind(r.body) !== 'minute') r = { ...r, body: { error: { details: [{ violations: [{ quotaId: 'PerDay' }] }] } } };
  }
  if (!r.ok) {
    const err = errorMessage(r.status, r.body);
    if (transient(r.status) && tried.length > 1) err.message += ' ' + t('Modelos tentados: {list}.', { list: tried.join(', ') });
    throw err;
  }
  const body = r.body;
  const cand = body && body.candidates && body.candidates[0];
  const text = cand && cand.content && (cand.content.parts || []).map(p => p.text || '').join('');
  if (!text) {
    const why = (body && body.promptFeedback && body.promptFeedback.blockReason) || (cand && cand.finishReason) || t('resposta vazia');
    throw new AiError(t('O Gemini não devolveu uma resposta ({why}). Tente de novo.', { why }), 'empty');
  }
  try {
    return { data: JSON.parse(text), model, fallback };
  } catch {
    throw new AiError(t('A resposta do Gemini veio incompleta. Tente de novo.'), 'parse');
  }
}
