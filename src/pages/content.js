// Textos das janelas Privacidade, Termos de uso e Novidades (português e inglês).
// Carregado só quando uma delas é aberta. Ao mudar o que o app guarda ou envia, atualizar a Privacidade.

export const UPDATED = '2026-10-03';

/** Novidades, da mais nova para a mais antiga. A data da primeira fica também em latest.js. */
export const NEWS = [
  {
    date: '2026-10-03',
    pt: [
      'Resumo do save no card do treinador: tempo de jogo, dinheiro, insígnias e Pokédex nos jogos oficiais (também no Quetzal; no Unbound, por enquanto só o tempo de jogo). Tempo de jogo e insígnias também aparecem na imagem da equipe.',
      'O que mudou: a comparação vai sempre do save mais antigo para o mais novo (pelo tempo de jogo), e Pokémon com IVs, natureza ou habilidade trocados aparecem como "treinados" em vez de "novos" e "saíram". A busca mostra 15 por página.',
      'Detalhe do Pokémon: HP atual quando ele está ferido (jogos oficiais, Unbound e Quetzal, inclusive no PC do Quetzal).',
      'Suporte ao Pokémon Unbound (versão 2.1 em diante): equipe e as 25 caixas do PC, com as espécies, formas, stats e itens do Unbound.',
      'Jogos de DS: Diamond/Pearl, Platinum, HeartGold/SoulSilver, Black/White e Black 2/White 2 (.dsv do DeSmuME e exports do Action Replay DS, .duc), com tipos, stats e golpes como eram na época.',
      'Erro ao abrir um save aparece numa janela no meio da tela, com o motivo.',
      'Assistente e Buscar ficam recolhidos até você abrir; a busca mostra os resultados em páginas.',
      'O que mudou: ao abrir o save depois de jogar, o app mostra quem chegou, evoluiu, subiu de nível, aprendeu golpes ou saiu, comparando com a versão anterior. O histórico fica só neste aparelho.',
      'Imagem da equipe: gera um PNG da equipe para compartilhar ou baixar.',
      'Versão em inglês: segue o idioma do navegador, ou use o botão EN/PT.',
      'Páginas de privacidade e termos de uso, e esta lista de novidades.',
    ],
    en: [
      'Save summary in the trainer card: play time, money, badges and Pokédex in the official games (also in Quetzal; in Unbound, only play time for now). Play time and badges also show up in the party image.',
      'What changed: the comparison always goes from the older save to the newer one (by play time), and Pokémon with changed IVs, nature or ability show up as "trained" instead of "new" and "gone". Search shows 15 per page.',
      'Pokémon details: current HP when it is hurt (official games, Unbound and Quetzal, including Quetzal’s PC).',
      'Pokémon Unbound support (version 2.1 onward): party and all 25 PC boxes, with Unbound’s species, forms, stats and items.',
      'DS games: Diamond/Pearl, Platinum, HeartGold/SoulSilver, Black/White and Black 2/White 2 (DeSmuME .dsv files and Action Replay DS exports, .duc), with types, stats and moves as they were back then.',
      'An error opening a save shows up in a window in the middle of the screen, with the reason.',
      'Assistant and Search stay collapsed until you open them; search shows results in pages.',
      'What changed: when you open the save after playing, the app shows who arrived, evolved, leveled up, learned moves or left, compared with the previous version. The history stays on this device only.',
      'Party image: creates a PNG of your party to share or download.',
      'English version: follows your browser language, or use the EN/PT button.',
      'Privacy and terms of use pages, and this list of what’s new.',
    ],
  },
  {
    date: '2026-10-02',
    pt: [
      'Antes de falar com a IA, o app mostra exatamente o que vai ser enviado.',
      'Save de exemplo, para experimentar sem o jogo.',
      'Suporte a Pokémon Emerald, FireRed/LeafGreen e Ruby/Sapphire, e a exports do GameShark (.sps). Save de jogo não suportado mostra um aviso.',
      'Quetzal: shiny, gênero e natureza da equipe lidos do save.',
      'Detalhe do Pokémon: dano recebido por tipo, linha evolutiva e golpes por nível.',
      'Novo nome (savDex) e ícone; equipe em grade de sprites.',
    ],
    en: [
      'Before talking to the AI, the app shows exactly what will be sent.',
      'Example save, to try it without the game.',
      'Support for Pokémon Emerald, FireRed/LeafGreen and Ruby/Sapphire, and GameShark exports (.sps). A save from an unsupported game shows a warning.',
      'Quetzal: party shiny, gender and nature read from the save.',
      'Pokémon details: damage taken by type, evolution line and level-up moves.',
      'New name (savDex) and icon; party shown as a sprite grid.',
    ],
  },
  {
    date: '2026-10-01',
    pt: [
      'Assistente com IA (Gemini ou Groq, com a sua chave grátis): avalia a equipe e monta uma equipe com os seus Pokémon.',
      'Abrir o save pelo menu Compartilhar do Android.',
      'Busca e filtros na equipe e no PC, análise de fraquezas e cobertura, detalhes dos golpes.',
      'Primeira versão: treinador, equipe e PC do Pokémon Quetzal, exportação para planilha, Showdown e JSON, e funcionamento offline.',
    ],
    en: [
      'AI assistant (Gemini or Groq, with your own free key): rates your party and builds a team from your Pokémon.',
      'Open the save from the Android Share menu.',
      'Search and filters across party and PC, weakness and coverage analysis, move details.',
      'First version: Pokémon Quetzal trainer, party and PC, export to spreadsheet, Showdown and JSON, and offline use.',
    ],
  },
];

const PRIVACY = {
  pt: {
    title: 'Privacidade',
    html: `
<p>O savDex foi feito para funcionar no seu aparelho. Não tem conta, cadastro, anúncios nem cookies.</p>
<h3>Seu save</h3>
<ul>
  <li>O arquivo é lido no navegador. Ele <b>não é enviado</b> para nenhum servidor, nem para o savDex.</li>
  <li>Uma cópia do último save aberto fica guardada <b>só neste navegador</b> (IndexedDB), para abrir sozinha na próxima visita. O botão <b>Esquecer este save</b> apaga essa cópia. O save de exemplo não é guardado.</li>
  <li><b>Histórico</b>: cada vez que você abre o save depois de jogar, uma versão dele fica guardada neste navegador (até 30 por save), para o app mostrar o que mudou. O botão <b>Apagar o histórico deste save</b>, na janela Histórico, apaga essas versões.</li>
  <li>A <b>imagem da equipe</b> é desenhada no aparelho; ela só sai daqui se você a compartilhar.</li>
  <li>Quando você abre o save pelo menu Compartilhar do Android, o arquivo passa pelo cache do navegador só até a página lê-lo.</li>
</ul>
<h3>O que fica guardado neste aparelho</h3>
<ul>
  <li>Preferências: tema, idioma, quais janelas (Assistente, Buscar) ficam abertas e as configurações do assistente (serviço, modelo e se deve mostrar o que vai ser enviado).</li>
  <li>As chaves de IA que você colar (localStorage). O botão <b>Apagar chave deste aparelho</b> remove a chave.</li>
  <li>Os arquivos do app e os sprites já vistos (cache), para funcionar offline.</li>
</ul>
<p>Limpar os dados do site no navegador apaga tudo isso.</p>
<h3>Conexões que o app faz</h3>
<ul>
  <li><b>Hospedagem</b>: o site é servido pelo Cloudflare Pages. Como em qualquer site, o servidor recebe dados técnicos do acesso (como o endereço IP).</li>
  <li><b>Sprites</b>: as imagens dos Pokémon vêm do repositório PokeAPI/sprites, no GitHub (raw.githubusercontent.com), que recebe esses pedidos de imagem.</li>
  <li><b>Assistente (IA), opcional</b>: só quando você toca em <b>Analisar minha equipe</b> ou <b>Montar equipe</b>, o navegador envia direto ao serviço escolhido (Google Gemini ou Groq), com a <b>sua</b> chave, a lista dos seus Pokémon (espécie, apelido, tipos, habilidade, item, natureza, stats base, IVs e golpes) e o seu pedido, se houver. Não vão: o arquivo .sav, seu nome de treinador, ID e SID, o nome do arquivo, nível, EVs nem PID. Antes de enviar, o app mostra o texto exato. O uso desses dados segue a política do serviço escolhido; no plano grátis, o Google pode usar o que recebe para melhorar os produtos dele.</li>
</ul>
<p>O savDex não usa ferramentas de análise de visitas. Se isso mudar, esta página será atualizada antes.</p>`,
  },
  en: {
    title: 'Privacy',
    html: `
<p>savDex is made to run on your device. There are no accounts, sign-ups, ads or cookies.</p>
<h3>Your save</h3>
<ul>
  <li>The file is read in the browser. It is <b>never uploaded</b> to any server, savDex included.</li>
  <li>A copy of the last save you opened is kept <b>only in this browser</b> (IndexedDB) so it opens by itself next time. The <b>Forget this save</b> button deletes that copy. The example save is not kept.</li>
  <li><b>History</b>: each time you open the save after playing, a version of it is kept in this browser (up to 30 per save) so the app can show what changed. The <b>Delete this save’s history</b> button, in the History window, deletes those versions.</li>
  <li>The <b>party image</b> is drawn on your device; it only leaves it if you share it.</li>
  <li>When you open the save from the Android Share menu, the file goes through the browser cache only until the page reads it.</li>
</ul>
<h3>What is stored on this device</h3>
<ul>
  <li>Preferences: theme, language, which panels (Assistant, Search) stay open and the assistant settings (service, model and whether to show what will be sent).</li>
  <li>The AI keys you paste (localStorage). The <b>Delete key from this device</b> button removes a key.</li>
  <li>The app files and the sprites you have already seen (cache), so it works offline.</li>
</ul>
<p>Clearing the site data in your browser erases all of this.</p>
<h3>Connections the app makes</h3>
<ul>
  <li><b>Hosting</b>: the site is served by Cloudflare Pages. As with any website, the server receives technical data about the visit (such as the IP address).</li>
  <li><b>Sprites</b>: Pokémon images come from the PokeAPI/sprites repository on GitHub (raw.githubusercontent.com), which receives those image requests.</li>
  <li><b>Assistant (AI), optional</b>: only when you tap <b>Rate my party</b> or <b>Build a team</b>, the browser sends directly to the chosen service (Google Gemini or Groq), with <b>your</b> key, the list of your Pokémon (species, nickname, types, ability, item, nature, base stats, IVs and moves) and your request, if any. Not sent: the .sav file, your trainer name, ID and SID, the file name, level, EVs or PID. Before sending, the app shows the exact text. That data is handled under the chosen service’s policy; on the free tier, Google may use what it receives to improve its products.</li>
</ul>
<p>savDex uses no visitor analytics. If that changes, this page will be updated first.</p>`,
  },
};

const TERMS = {
  pt: {
    title: 'Termos de uso',
    html: `
<ul>
  <li>O savDex é um <b>projeto de fã</b>, gratuito e sem vínculo com Nintendo, Creatures, GAME FREAK, The Pokémon Company ou com os autores dos hacks (como o Quetzal). Pokémon e os nomes relacionados são marcas dos seus donos.</li>
  <li>O app <b>só lê</b> o save: ele nunca altera o seu arquivo. Mesmo assim, guarde cópias dos seus saves.</li>
  <li>Ele é oferecido <b>como está</b>, sem garantia. Os formatos de save foram estudados a partir de documentação pública e de saves reais; o que ainda não foi confirmado aparece como <b>provável</b> ou <b>não lido</b>. Hacks podem mudar espécies, golpes e itens.</li>
  <li>As respostas do assistente são geradas por IA e podem estar erradas. O uso do Gemini e do Groq segue os termos de cada serviço; a chave é sua e fica sob a sua responsabilidade.</li>
  <li>Use o app com os seus próprios saves.</li>
  <li>Estes termos e a página de privacidade podem mudar; a data da última atualização fica abaixo.</li>
</ul>`,
  },
  en: {
    title: 'Terms of use',
    html: `
<ul>
  <li>savDex is a free <b>fan project</b>, not affiliated with Nintendo, Creatures, GAME FREAK, The Pokémon Company or the authors of the hacks (such as Quetzal). Pokémon and related names are trademarks of their owners.</li>
  <li>The app <b>only reads</b> the save: it never changes your file. Still, keep backups of your saves.</li>
  <li>It is provided <b>as is</b>, without warranty. The save formats were studied from public documentation and real saves; anything not yet confirmed is shown as <b>probable</b> or <b>not read</b>. Hacks may change species, moves and items.</li>
  <li>The assistant’s answers are generated by AI and may be wrong. Using Gemini and Groq is subject to each service’s terms; the key is yours and your responsibility.</li>
  <li>Use the app with your own saves.</li>
  <li>These terms and the privacy page may change; the date of the last update is shown below.</li>
</ul>`,
  },
};

const fmtDate = (iso, lang) => new Date(iso + 'T12:00:00').toLocaleDateString(lang === 'en' ? 'en-US' : 'pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Título e HTML de uma janela no idioma pedido (null se a página não existe). */
export function page(id, lang) {
  const L = lang === 'en' ? 'en' : 'pt';
  const updated = `<p class="hint">${L === 'en' ? 'Last updated' : 'Atualizado em'} ${fmtDate(UPDATED, L)}.</p>`;
  if (id === 'privacidade') return { title: PRIVACY[L].title, html: PRIVACY[L].html + updated };
  if (id === 'termos') return { title: TERMS[L].title, html: TERMS[L].html + updated };
  if (id === 'novidades') {
    return {
      title: L === 'en' ? 'What’s new' : 'Novidades',
      html: NEWS.map(n => `<section class="news"><h3><time datetime="${n.date}">${fmtDate(n.date, L)}</time></h3>
        <ul>${n[L].map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>`).join(''),
    };
  }
  return null;
}
