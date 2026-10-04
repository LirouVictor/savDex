// Cliente mínimo da API do Groq (compatível com a da OpenAI), chamado direto do navegador.
// A chave é do próprio usuário e fica só neste aparelho (localStorage).

import { t } from '../i18n.js';
import { AiError, store, call as httpCall, wait, transient } from './http.js';
import { schemaHint } from './prompt.js';

export const API = 'https://api.groq.com/openai/v1';

const KEY = 'groq-key';
const MODEL = 'groq-model';

export const id = 'groq';
export const label = 'Groq';
export const service = 'Groq';
export const keyUrl = 'https://console.groq.com/keys';
export const keySteps = 'entre com a conta Google ou GitHub e toque em <b>Create API Key</b>';
export const keyPlaceholder = 'Chave do Groq (gsk_…)';
export const privacy = '';
/** O plano grátis do Groq limita os tokens por minuto: manda menos Pokémon do PC. */
export const maxCandidates = 60;

/** Modelos preferidos, do melhor para o pior (os que não existirem são ignorados). */
const PREFERRED = ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'moonshotai/kimi-k2-instruct', 'qwen/qwen3-32b', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'];

export const getKey = () => store.get(KEY);
export const setKey = v => store.set(KEY, (v || '').trim());
/** Vazio = escolher sozinho na primeira vez (pela lista de modelos da chave). */
export const getModel = () => store.get(MODEL);
export const setModel = v => store.set(MODEL, (v || '').trim());

const call = (url, init, fetchImpl) => httpCall(url, init, fetchImpl, service);
const defaultFetch = (...a) => fetch(...a);

export function errorMessage(status, body) {
  const e = body && body.error ? body.error : {};
  const code = String(e.code || '');
  const msg = String(e.message || '');
  if (status === 401 || code === 'invalid_api_key') return new AiError(t('A chave do Groq não é válida. Confira se copiou a chave inteira.'), 'key');
  if (status === 403) return new AiError(t('A chave não tem permissão para usar o Groq. Crie uma chave nova no console do Groq.'), 'key');
  if (status === 413 || /too large|tokens per minute|TPM/i.test(msg)) return new AiError(t('O pedido ficou grande demais para o limite grátis do Groq. Espere um minuto e tente de novo.'), 'quota');
  if (status === 429) return new AiError(t('Limite do plano grátis do Groq atingido. Espere um minuto e tente de novo.'), 'quota');
  if (status === 404 || code === 'model_not_found' || code === 'model_decommissioned') return new AiError(t('O modelo não foi encontrado ({msg}).', { msg: msg || t('erro {status}', { status }) }), 'model');
  if (status >= 500) return new AiError(t('O Groq está sobrecarregado ou fora do ar. Tente de novo daqui a pouco. ({detail})', { detail: `${status}${msg ? ': ' + msg : ''}` }), 'server');
  return new AiError(t('O Groq recusou o pedido ({detail}).', { detail: `${status}${msg ? ': ' + msg : ''}` }), 'other');
}

/** Modelos de texto disponíveis para a chave, os preferidos primeiro. */
export async function listModels(key, fetchImpl = defaultFetch) {
  const res = await call(`${API}/models`, { headers: { authorization: `Bearer ${key}` } }, fetchImpl);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw errorMessage(res.status, body);
  const models = ((body && body.data) || [])
    .filter(m => m.active !== false && !/whisper|tts|guard|playai|orpheus|distil|compound|allam/i.test(m.id));
  const rank = m => { const i = PREFERRED.indexOf(m.id); return i < 0 ? PREFERRED.length : i; };
  return models.sort((a, b) => rank(a) - rank(b) || (b.context_window || 0) - (a.context_window || 0)).map(m => m.id);
}

async function request({ system, prompt, schema, key, model, fetchImpl }) {
  const body = {
    model,
    messages: [
      { role: 'system', content: `${system}\n\n${schemaHint(schema)}` },
      { role: 'user', content: prompt },
    ],
    temperature: 0.4,
    max_completion_tokens: 4096,
    response_format: { type: 'json_object' },
  };
  if (/gpt-oss/.test(model)) body.reasoning_effort = 'low';
  const res = await call(`${API}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  }, fetchImpl);
  return { status: res.status, ok: res.ok, body: await res.json().catch(() => null) };
}

const missingModel = r => r.status === 404 || (r.body && r.body.error && /model_not_found|model_decommissioned/.test(String(r.body.error.code)));

/**
 * Gera uma resposta em JSON. Sem modelo escolhido (ou com modelo que deixou de existir),
 * pega o melhor da lista e guarda. Sobrecarga (5xx): tenta de novo e depois até 2 outros modelos.
 * @returns {Promise<{ data: object, model: string, fallback: boolean }>} fallback = veio de outro modelo (sobrecarga)
 */
export async function generateJSON({ system, prompt, schema, key = getKey(), model = getModel(), fetchImpl = defaultFetch, sleep = wait }) {
  if (!key) throw new AiError(t('Cole sua chave do Groq primeiro.'), 'key');
  const args = { system, prompt, schema, key, fetchImpl };
  let names = null;
  const list = async () => (names = names || await listModels(key, fetchImpl));
  if (!model) {
    model = (await list())[0];
    if (!model) throw new AiError(t('Não encontrei um modelo de texto disponível para esta chave do Groq.'), 'model');
    setModel(model);
  }
  const tried = [model];
  let fallback = false; // a resposta veio de outro modelo, porque o escolhido estava sobrecarregado
  let r = await request({ ...args, model });
  if (missingModel(r)) {
    model = (await list()).find(n => !tried.includes(n));
    if (!model) throw errorMessage(r.status, r.body);
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
    try { others = (await list()).filter(n => !tried.includes(n)).slice(0, 2); } catch { /* fica com o erro original */ }
    for (const other of others) {
      tried.push(other);
      const r2 = await request({ ...args, model: other });
      if (r2.ok || !transient(r2.status)) { r = r2; model = other; fallback = true; break; }
    }
  }
  if (!r.ok) {
    const err = errorMessage(r.status, r.body);
    if (transient(r.status) && tried.length > 1) err.message += ' ' + t('Modelos tentados: {list}.', { list: tried.join(', ') });
    throw err;
  }
  const choice = r.body && r.body.choices && r.body.choices[0];
  const text = choice && choice.message && choice.message.content;
  if (!text) throw new AiError(t('O Groq não devolveu uma resposta ({why}). Tente de novo.', { why: (choice && choice.finish_reason) || t('resposta vazia') }), 'empty');
  try {
    return { data: JSON.parse(text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '')), model, fallback };
  } catch {
    throw new AiError(t('A resposta do Groq veio incompleta. Tente de novo.'), 'parse');
  }
}
