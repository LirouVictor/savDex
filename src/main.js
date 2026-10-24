// Entrada leve: idioma, tema, abertura de arquivo e service worker.
// O parser, as tabelas e a renderização vêm em app.js, carregado sob demanda.

import '@fontsource/silkscreen/latin-400.css';
import '@fontsource/silkscreen/latin-700.css';
import './styles/main.css';
import { installImageFallback, installIconFit } from './ui/sprites.js';
import { rememberSave, loadRememberedSave, forgetSave } from './ui/store.js';
import { t, getLang, loadLang, saveLang, locale } from './i18n.js';
import { NEWS_LATEST } from './pages/latest.js';

const $ = s => document.querySelector(s);
const loadApp = () => import('./app.js');

installImageFallback();
installIconFit();

// Idioma: em inglês, troca os textos fixos do index.html (marcados com data-i18n) antes de mostrar a página.
const root = document.documentElement;
const norm = s => s.trim().replace(/\s+/g, ' ');
function applyStaticTexts() {
  root.lang = getLang() === 'en' ? 'en' : 'pt-BR';
  if (getLang() === 'pt') return;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.innerHTML = t(norm(el.innerHTML)); });
  document.querySelectorAll('[data-i18n-attr]').forEach(el => {
    el.dataset.i18nAttr.split(',').forEach(a => el.setAttribute(a, t(norm(el.getAttribute(a) || ''))));
  });
}
// Botão PT/EN: mostra o outro idioma; a troca recarrega a página (o último save reabre sozinho)
const DEMO_FLAG = 'savdex-reopen-demo';
function setupLangButton() {
  const other = getLang() === 'en' ? 'pt' : 'en';
  const btn = $('#lang');
  btn.textContent = other.toUpperCase();
  btn.lang = other === 'en' ? 'en' : 'pt-BR';
  btn.setAttribute('aria-label', other === 'en' ? 'Switch to English' : 'Mudar para português');
  btn.title = btn.getAttribute('aria-label');
  btn.addEventListener('click', () => {
    saveLang(other);
    try { if (showingDemo) sessionStorage.setItem(DEMO_FLAG, '1'); } catch { /* sem armazenamento */ }
    location.reload();
  });
}
const ready = loadLang().catch(e => console.error(e)).then(() => {
  applyStaticTexts();
  setupLangButton();
  syncThemeButton();
  delete root.dataset.langWait;
});
let showingDemo = false;
// Referência ao arquivo do save (seletor do sistema), para reler a versão atualizada com um toque
let savedHandle = null;

// Tema: segue o sistema até o usuário escolher; a escolha fica salva neste aparelho.
const systemDark = matchMedia('(prefers-color-scheme: dark)');
const currentTheme = () => root.dataset.theme || (systemDark.matches ? 'dark' : 'light');
function syncThemeButton() {
  const dark = currentTheme() === 'dark';
  $('#theme use').setAttribute('href', dark ? '#sun' : '#moon');
  $('#theme').setAttribute('aria-label', t(dark ? 'Usar tema claro' : 'Usar tema escuro'));
}
$('#theme').addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch { /* armazenamento indisponível */ }
  syncThemeButton();
});
systemDark.addEventListener('change', syncThemeButton);
syncThemeButton();

// Abrir arquivo
// Erro ao abrir: janela no meio da tela (a mensagem no fim da página passava despercebida)
function showError(msg) {
  const dlg = $('#err');
  dlg.innerHTML = `<button class="btn btn-ghost btn-icon close" type="button" data-close aria-label="${t('Fechar')}">✕</button>
    <h2 class="pixel" id="err-title">${t('Não consegui abrir o save')}</h2>
    <p class="err-msg" role="alert"></p>
    <div class="export-btns">
      <label class="btn" for="file" data-close>${t('Escolher outro arquivo')}</label>
      <button class="btn btn-ghost" type="button" data-close>${t('Fechar')}</button>
    </div>`;
  dlg.querySelector('.err-msg').textContent = msg;
  dlg.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dlg.close()));
  dlg.showModal();
}

function showSavedNote(name, savedAt) {
  const when = new Date(savedAt).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' });
  $('#saved-text').textContent = savedHandle
    ? t('Mostrando a cópia guardada de "{name}" (aberta em {when}). Se você jogou depois disso, toque em Atualizar para ler o arquivo de novo.', { name, when })
    : t('Mostrando a cópia guardada de "{name}" (aberta em {when}). Se você jogou depois disso, abra o .sav de novo para atualizar.', { name, when });
  $('#saved-open').textContent = savedHandle ? t('Atualizar') : t('Abrir save atualizado');
  $('#forget').classList.remove('hidden');
  $('#saved-note').classList.remove('hidden');
}

function showDemoNote() {
  $('#saved-text').textContent = t('Você está vendo um save de exemplo, com Pokémon fictícios. Abra o seu .sav para ver os seus.');
  $('#saved-open').textContent = t('Abrir meu save');
  $('#forget').classList.add('hidden');
  $('#saved-note').classList.remove('hidden');
}

/**
 * Abre um save a partir dos bytes.
 * @param {ArrayBuffer} buf
 * @param {string} name
 * @param {{ fromCopy?: number }} [opts] fromCopy = data em que a cópia guardada foi feita
 */
async function openBytes(buf, name, opts = {}) {
  await ready;
  const app = await loadApp();
  await app.openSave(buf, name, { history: !opts.demo });
  showingDemo = !!opts.demo;
  $('#intro').classList.add('hidden');
  $('#reopen').classList.remove('hidden');
  if (opts.fromCopy) showSavedNote(name, opts.fromCopy);
  else if (opts.demo) showDemoNote();
  else $('#saved-note').classList.add('hidden');
  scrollTo(0, 0);
}

/**
 * @param {File} file
 * @param {FileSystemFileHandle} [handle] referência ao arquivo, quando escolhido pelo seletor do sistema
 */
async function load(file, handle) {
  try {
    const buf = await file.arrayBuffer();
    await openBytes(buf, file.name);
    savedHandle = handle || null;
    // Guarda uma cópia para abrir automaticamente na próxima visita (só neste aparelho)
    // e, se houver, a referência ao arquivo para reler a versão atualizada sem escolher de novo.
    rememberSave({ name: file.name, bytes: buf, handle: savedHandle || undefined });
  } catch (e) {
    console.error(e);
    showError(e && e.name === 'SaveError'
      ? e.message
      : t('Não consegui ler este arquivo. Confira se é o .sav (ou .sps) de um jogo suportado e tente de novo.'));
    if ($('#out').classList.contains('hidden')) $('#intro').classList.remove('hidden');
  }
}

// Save de exemplo: montado na hora (Pokémon fictícios); não fica guardado como "último save"
async function openDemo() {
  try {
    const app = await loadApp();
    await openBytes(await app.demoBytes(), t('exemplo-savdex.sav'), { demo: true });
  } catch (e) {
    console.error(e);
    showError(t('Não consegui abrir o save de exemplo.'));
  }
}
$('#demo').addEventListener('click', openDemo);

$('#forget').addEventListener('click', async () => {
  await forgetSave();
  savedHandle = null;
  $('#saved-note').classList.add('hidden');
  $('#out').classList.add('hidden');
  $('#out').innerHTML = '';
  $('#reopen').classList.add('hidden');
  $('#dex-open').hidden = true;
  document.body.classList.remove('dex-mode');
  $('#intro').classList.remove('hidden');
  showingDemo = false;
  scrollTo(0, 0);
});

// Save recebido pelo menu "Compartilhar" do Android (o service worker guarda; ver sw-template.js).
const SHARE_CACHE = 'qsv-share';
const SHARE_KEY = './shared-save';
async function takeSharedSave() {
  if (!new URLSearchParams(location.search).has('shared')) return null;
  history.replaceState(null, '', location.pathname);
  try {
    const cache = await caches.open(SHARE_CACHE);
    const res = await cache.match(SHARE_KEY);
    if (!res) return null;
    await cache.delete(SHARE_KEY);
    const name = decodeURIComponent(res.headers.get('x-file-name') || 'save.sav');
    return new File([await res.blob()], name);
  } catch {
    return null;
  }
}

// Abre o save compartilhado; se não houver, o exemplo (se estava aberto antes de trocar o idioma)
// ou a cópia do último save, se houver.
ready.then(takeSharedSave).then(async shared => {
  if (shared) return load(shared);
  let demo = false;
  try { demo = sessionStorage.getItem(DEMO_FLAG) === '1'; sessionStorage.removeItem(DEMO_FLAG); } catch { /* sem armazenamento */ }
  if (demo) return openDemo();
  const saved = await loadRememberedSave();
  if (!saved || !$('#out').classList.contains('hidden')) return;
  savedHandle = saved.handle || null;
  // Com a permissão ainda valendo (o Chrome do computador a mantém no app instalado), lê o arquivo
  // atual sozinho se ele mudou depois da cópia; sem ela, abre a cópia e o botão Atualizar relê.
  if (savedHandle) {
    try {
      if ((await savedHandle.queryPermission({ mode: 'read' })) === 'granted') {
        const file = await savedHandle.getFile();
        if (file.lastModified > saved.savedAt) return load(file, savedHandle);
      }
    } catch { /* arquivo movido ou sem permissão: fica a cópia */ }
  }
  openBytes(saved.bytes, saved.name, { fromCopy: saved.savedAt }).catch(() => forgetSave());
});

// Seletor do sistema (File System Access; Chrome do Android 132+ e do computador): o app guarda a
// referência ao arquivo escolhido e, nas próximas visitas, relê o .sav atualizado com um toque, sem
// procurar o arquivo de novo. Sem a API, os botões continuam abrindo o <input type="file">.
async function pickFile() {
  let handle;
  try {
    [handle] = await window.showOpenFilePicker({ id: 'save' });
  } catch (e) {
    if (e && e.name !== 'AbortError') $('#file').click();
    return;
  }
  let file;
  try { file = await handle.getFile(); } catch { return showError(t('Não consegui ler este arquivo. Confira se é o .sav (ou .sps) de um jogo suportado e tente de novo.')); }
  await load(file, handle);
}

// Relê o arquivo guardado (botão Atualizar). Pede a permissão de leitura de novo, se o navegador pedir.
async function refreshSave() {
  const handle = savedHandle;
  let file;
  try {
    if ((await handle.queryPermission({ mode: 'read' })) !== 'granted'
      && (await handle.requestPermission({ mode: 'read' })) !== 'granted') return;
    file = await handle.getFile();
  } catch {
    savedHandle = null;
    return showError(t('Não consegui ler o arquivo de novo (ele pode ter sido movido ou renomeado). Escolha o .sav outra vez.'));
  }
  await load(file, handle);
}

if (typeof window.showOpenFilePicker === 'function') {
  // Captura: roda antes do clique abrir o <input>; os outros ouvintes (fechar o aviso de erro) continuam.
  document.addEventListener('click', e => {
    const label = e.target instanceof Element && e.target.closest('label[for="file"]');
    if (!label) return;
    e.preventDefault();
    if (label.id === 'saved-open' && savedHandle && !showingDemo) refreshSave();
    else pickFile();
  }, true);
}

$('#file').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  if (f) load(f);
  e.target.value = '';
});

// Privacidade, Termos de uso e Novidades: janelas abertas pelos links do rodapé (#privacidade…),
// com os textos carregados só na hora. O endereço com # abre a janela direto.
const PAGES = ['privacidade', 'termos', 'novidades'];
const NEWS_SEEN = 'news-seen';
function syncNewsMark() {
  let seen = '';
  try { seen = localStorage.getItem(NEWS_SEEN) || ''; } catch { /* sem armazenamento */ }
  $('.news-link').classList.toggle('new', seen < NEWS_LATEST);
}
async function openPage(id) {
  const dlg = $('#page');
  const { page } = await import('./pages/content.js');
  const p = page(id, getLang());
  if (!p) return;
  dlg.innerHTML = `<button class="btn btn-ghost btn-icon close" type="button" data-close aria-label="${t('Fechar')}">✕</button>
    <h2 class="pixel" id="page-title">${p.title}</h2><div class="page-body">${p.html}</div>`;
  dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
  if (id === 'novidades') {
    try { localStorage.setItem(NEWS_SEEN, NEWS_LATEST); } catch { /* sem armazenamento */ }
    syncNewsMark();
  }
}
const pageFromHash = () => { const id = location.hash.slice(1); if (PAGES.includes(id)) openPage(id); };
$('#page').addEventListener('close', () => {
  if (PAGES.includes(location.hash.slice(1))) history.replaceState(null, '', location.pathname + location.search);
});
addEventListener('hashchange', pageFromHash);
ready.then(() => { syncNewsMark(); pageFromHash(); });

const drop = $('#drop');
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, () => drop.classList.remove('over')));
// Soltar o arquivo em qualquer lugar da página (inclusive na área acima) abre o save
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) load(f); });

// Pré-carrega o resto do app quando o navegador estiver ocioso (fica pronto e entra no cache offline).
(window.requestIdleCallback || (cb => setTimeout(cb, 1500)))(() => loadApp());

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
