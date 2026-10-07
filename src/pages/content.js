// Textos das janelas Privacidade, Termos de uso e Novidades (português e inglês).
// Carregado só quando uma delas é aberta. Ao mudar o que o app guarda ou envia, atualizar a Privacidade.

export const UPDATED = '2026-10-06';

/** Novidades, da mais nova para a mais antiga. A data da primeira fica também em latest.js. */
export const NEWS = [
  {
    date: '2026-10-07',
    pt: [
      'Detalhe do Pokémon renovado: cabeçalho com a cor do tipo, barra no topo com copiar e fechar sempre à mão, natureza/item/habilidade/bola em duas colunas, poder e precisão já na linha de cada golpe e barras de stats coloridas (do mais fraco ao mais forte).',
      'Fraquezas e resistências: tocar num tipo mostra, logo abaixo, quem é fraco, resiste ou é imune, com o multiplicador de cada um.',
      'Visual novo: o texto corrido agora usa a fonte do aparelho, bem mais fácil de ler; a fonte pixel fica nos títulos, botões e números.',
      'Barra embaixo para ir direto ao Resumo, à Equipe, ao PC ou às Ferramentas (Assistente e Exportar). No computador, Equipe e PC ficam lado a lado.',
      'Cartões da equipe com os tipos e uma barra de HP quando o Pokémon está ferido; card do treinador mais limpo; os detalhes técnicos de cada Pokémon foram para "Avançado"; a lista de jogos da tela inicial ficou compacta.',
      'SoulGold: a evolução e os golpes por nível no detalhe de cada Pokémon agora vêm do próprio jogo, sem o “provável”, com as condições do SoulGold (ex.: Magnezone subindo de nível em Railway Cave ou com Thunder Stone).',
      'SoulGold: corrigida a leitura de equipes com mais de um Pokémon (o save não abria). A habilidade agora vem do save (2ª e oculta também), e o PC foi conferido no próprio jogo, sem o aviso de “provável”.',
      'Novo jogo: Pokémon SoulGold (hack de Emerald ambientado em Johto). Mostra treinador, equipe, PC e o resumo (tempo de jogo, dinheiro, insígnias e a Pokédex de Johto), conferidos no próprio jogo. O PC ainda não foi conferido com Pokémon dentro, e a habilidade aparece como “provável”.',
      'Unbound: dinheiro, insígnias, tempo de jogo e Pokédex do resumo do save agora estão conferidos no próprio jogo, sem o “provável”. A Pokédex conta como a do jogo: a Nacional vai até o Melmetal (809).',
    ],
    en: [
      'Refreshed Pokémon details: header in the type’s color, a top bar with copy and close always at hand, nature/item/ability/ball in two columns, power and accuracy right on each move and colored stat bars (weakest to strongest).',
      'Weaknesses and resistances: tapping a type shows, right below it, who is weak, resists or is immune, with each one’s multiplier.',
      'New look: body text now uses your device’s font, much easier to read; the pixel font stays on titles, buttons and numbers.',
      'A bottom bar jumps straight to Summary, Party, PC or Tools (Assistant and Export). On a computer, Party and PC sit side by side.',
      'Party cards show types and an HP bar when the Pokémon is hurt; a cleaner trainer card; each Pokémon’s technical details moved to "Advanced"; the game list on the home screen is now compact.',
      'SoulGold: the evolution and level-up moves in each Pokémon’s details now come from the game itself, without the “probable” tag, with SoulGold’s conditions (e.g. Magnezone leveling up in Railway Cave or with a Thunder Stone).',
      'SoulGold: fixed reading parties with more than one Pokémon (the save would not open). The ability now comes from the save (2nd and hidden too), and the PC was checked against the game itself, without the “probable” warning.',
      'New game: Pokémon SoulGold (an Emerald hack set in Johto). Shows trainer, party, PC and the summary (play time, money, badges and the Johto Pokédex), checked against the game itself. The PC has not been checked with Pokémon in it yet, and the ability shows as “probable”.',
      'Unbound: money, badges, play time and Pokédex in the save summary are now checked against the game itself, without the “probable” tag. The Pokédex counts like the game’s: the National Dex goes up to Melmetal (809).',
    ],
  },
  {
    date: '2026-10-06',
    pt: [
      'Unbound: o resumo do save agora mostra também dinheiro, insígnias e Pokédex (capturados), marcados como “provável” até serem conferidos com a tela do jogo.',
      'Unbound: a evolução e os golpes por nível no detalhe de cada Pokémon agora vêm do próprio jogo, com os métodos do Unbound (ex.: Gallade com Dawn Stone só para macho, Magnezone subindo de nível em Thundercap Mt., Lycanroc Dusk das 17h às 20h), sem o “provável”. O assistente de IA também usa essa lista.',
      'Unbound: tipo, poder, precisão, PP e categoria dos golpes agora são os do próprio jogo, que mudou vários (ex.: Flamethrower 95, Leech Life 20, Recover com 10 PP).',
      'Unbound: itens-chave e TMs com os nomes do próprio jogo (ex.: Dynamax Band, Mega Ring), Ursaluna com os tipos na ordem certa (Ground/Normal) e o nome da habilidade As One do Calyrex corrigido.',
      'Quetzal: tipo, poder, precisão e categoria dos golpes agora vêm do próprio jogo (ex.: no Quetzal, Growth é Grass e Nihil Light é Dragon especial de poder 200).',
      'Golpes por nível com visual novo: o título virou um botão que mostra quantos golpes há, cada golpe aparece como um cartão com o tipo, a categoria e o poder, e uma linha marca o nível atual do Pokémon.',
      'Mais leve: na primeira visita (e a cada atualização) o app baixa só o essencial para funcionar offline, cerca de um terço do que baixava antes. As tabelas de cada jogo, o assistente de IA e os textos em inglês só são baixados e guardados quando você usa.',
      'Quetzal: os golpes por nível no detalhe de cada Pokémon (e os usados pelo assistente de IA) agora são os do próprio jogo, sem o “provável”. O detalhe também ficou mais leve de carregar.',
    ],
    en: [
      'Unbound: the save summary now also shows money, badges and Pokédex (caught), marked as “probable” until checked against the game screen.',
      'Unbound: the evolution and level-up moves in each Pokémon’s details now come from the game itself, with Unbound’s methods (e.g. Gallade with a Dawn Stone only for males, Magnezone leveling up at Thundercap Mt., Dusk Lycanroc from 17:00 to 20:00), without the “probable” tag. The AI assistant uses this list too.',
      'Unbound: move type, power, accuracy, PP and category now are the game’s own, and it changed several (e.g. Flamethrower 95, Leech Life 20, Recover with 10 PP).',
      'Unbound: key items and TMs with the game’s own names (e.g. Dynamax Band, Mega Ring), Ursaluna with its types in the right order (Ground/Normal) and the name of Calyrex’s As One ability fixed.',
      'Quetzal: move type, power, accuracy and category now come from the game itself (e.g. in Quetzal, Growth is Grass and Nihil Light is a special Dragon move with 200 power).',
      'Level-up moves have a new look: the title became a button that shows how many moves there are, each move is a card with its type, category and power, and a line marks the Pokémon’s current level.',
      'Lighter: on the first visit (and on each update) the app downloads only the essentials to work offline, about a third of what it downloaded before. Each game’s tables, the AI assistant and the English texts are only downloaded and stored when you use them.',
      'Quetzal: the level-up moves in each Pokémon’s details (and the ones the AI assistant uses) now come from the game itself, without the “probable” tag. The details also load lighter.',
    ],
  },
  {
    date: '2026-10-05',
    pt: [
      'Quetzal: itens, golpes e Pokémon com ID próprio agora vêm das tabelas do próprio jogo. Todos os itens aparecem com o nome certo (antes, do 511 em diante eram “prováveis” ou “não mapeados”), mais de 600 formas regionais, megas e Pokémon da Gen 9 são reconhecidos com os tipos, stats e habilidades do Quetzal, a Basculegion fêmea é identificada e o Pikachu “estilo Red” tem os stats certos.',
      'Quetzal: a linha evolutiva no detalhe de cada Pokémon agora mostra os métodos do próprio jogo, que mudou várias evoluções (sem evolução por amizade, Eevee só por pedras, Raichu de Alola para o Pikachu que sabe Surf, trocas com alternativa de subir de nível segurando o item…).',
    ],
    en: [
      'Quetzal: items, moves and Pokémon with Quetzal-specific IDs now come from the game’s own tables. Every item shows its correct name (before, from 511 on they were “probable” or “not mapped”), over 600 regional forms, Megas and Gen 9 Pokémon are recognized with Quetzal’s types, stats and abilities, the female Basculegion is identified and the “Red style” Pikachu has the right stats.',
      'Quetzal: the evolution line in each Pokémon’s details now shows the game’s own methods, which changed many evolutions (no friendship evolutions, Eevee only by stones, Alolan Raichu for a Pikachu that knows Surf, trades with a level-up-holding-the-item alternative…).',
    ],
  },
  {
    date: '2026-10-04',
    pt: [
      'Assistente (IA), Quetzal e Unbound: o app confere os golpes que a IA sugere com a lista de golpes por nível de cada Pokémon e marca "aprende por nível" ou avisa quando não está na lista. A equipe montada também avisa quem está com o nível bem abaixo do resto, e a IA deixa de sugerir o que o Pokémon já tem.',
      'Assistente (IA): “Montar equipe” agora tem duas etapas. Depois de escolher os 6, um segundo envio bem menor, só com essa equipe e as contas do app sobre ela (e os golpes por nível no Quetzal/Unbound), escreve os pontos fracos e as dicas, que passam a atacar os buracos que a conferência mostra. O resultado avisa quando veio de um modelo mais leve por sobrecarga, e nomes de terreno (Grassy Terrain, Trick Room…) não são mais conferidos como golpe.',
    ],
    en: [
      'Assistant (AI), Quetzal and Unbound: the app checks the moves the AI suggests against each Pokémon’s level-up list and marks "learns by level" or warns when it is not on the list. The built team also flags members whose level is well below the rest, and the AI no longer suggests what the Pokémon already has.',
      'Assistant (AI): “Build a team” now has two steps. After picking the 6, a much smaller second request, with only that team and the app’s calculations about it (plus the level-up moves in Quetzal/Unbound), writes the weaknesses and tips, which now address the gaps the check shows. The result says when it came from a lighter model due to overload, and terrain names (Grassy Terrain, Trick Room…) are no longer checked as moves.',
    ],
  },
  {
    date: '2026-10-03',
    pt: [
      'Resumo do save no card do treinador: tempo de jogo, dinheiro, insígnias e Pokédex nos jogos oficiais (também no Quetzal; no Unbound, por enquanto só o tempo de jogo). Tempo de jogo e insígnias também aparecem na imagem da equipe.',
      'O que mudou: a comparação vai sempre do save mais antigo para o mais novo (pelo tempo de jogo), e Pokémon com IVs, natureza ou habilidade trocados aparecem como "treinados" em vez de "novos" e "saíram". A busca mostra 15 por página.',
      'Assistente (IA): a análise usa critérios fixos para a nota, recebe mais cálculos do app (velocidade, golpes físicos/especiais, megapedras, clima), só sugere golpes pelo nome se o Pokémon aprende (Quetzal/Unbound) e manda só os 50 Pokémon do PC que mais ajudam a equipe, gastando bem menos.',
      'Assistente (IA): “Montar equipe” segue critérios fixos (físicos × especiais, velocidade ou Trick Room, no máximo uma megapedra, nenhum tipo que acerte 3 ou mais em cheio), recebe as pistas de clima/terreno/Trick Room do PC, manda uma cópia de cada espécie e mostra as contas do app sobre a equipe sugerida. As dicas só aparecem quando mudam algo concreto.',
      'Assistente (IA): as megapedras vão marcadas para a IA, a conferência da equipe montada avisa quando ela fura um critério pedido (ex.: um tipo acertando 3 membros em cheio), golpes como Grassy Glide e Weather Ball contam nas pistas de clima/terreno, e a IA não afirma mais contagens de fraquezas que o app já mostra.',
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
      'Assistant (AI): the analysis uses fixed criteria for the score, gets more app calculations (speed, physical/special moves, Mega Stones, weather), only names moves the Pokémon can learn (Quetzal/Unbound) and sends only the 50 PC Pokémon that help the party the most, using much less.',
      'Assistant (AI): “Build a team” follows fixed criteria (physical × special, speed or Trick Room, at most one Mega Stone, no type hitting 3 or more super effectively), gets the weather/terrain/Trick Room hints from the PC, sends one copy of each species and shows the app’s calculations for the suggested team. Tips only show up when they change something concrete.',
      'Assistant (AI): Mega Stones are marked for the AI, the built team’s check warns when it breaks a requested criterion (e.g. a type hitting 3 members super effectively), moves such as Grassy Glide and Weather Ball count in the weather/terrain hints, and the AI no longer states weakness counts the app already shows.',
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
  <li>Os arquivos do app (o essencial na primeira visita; o resto, como as tabelas de cada jogo, quando é usado) e os sprites já vistos (cache), para funcionar offline.</li>
</ul>
<p>Limpar os dados do site no navegador apaga tudo isso.</p>
<h3>Conexões que o app faz</h3>
<ul>
  <li><b>Hospedagem</b>: o site é servido pelo Cloudflare Pages. Como em qualquer site, o servidor recebe dados técnicos do acesso (como o endereço IP).</li>
  <li><b>Sprites</b>: as imagens dos Pokémon vêm do repositório PokeAPI/sprites, no GitHub (raw.githubusercontent.com), que recebe esses pedidos de imagem.</li>
  <li><b>Assistente (IA), opcional</b>: só quando você toca em <b>Analisar minha equipe</b> ou <b>Montar equipe</b>, o navegador envia direto ao serviço escolhido (Google Gemini ou Groq), com a <b>sua</b> chave, a lista dos seus Pokémon (espécie, apelido, tipos, habilidade, item, natureza, stats base, IVs e golpes), cálculos do app sobre a equipe (fraquezas, cobertura, velocidade base), no Quetzal e no Unbound a lista pública dos golpes que cada membro aprende por nível, e o seu pedido, se houver. <b>Montar equipe</b> faz dois envios: o primeiro escolhe os 6; o segundo, menor, leva só essa equipe e as contas do app sobre ela, para os pontos fracos e as dicas. Não vão: o arquivo .sav, seu nome de treinador, ID e SID, o nome do arquivo, nível, EVs nem PID. Antes de enviar, o app mostra o texto exato do primeiro envio; o do segundo aparece junto com o resultado. O uso desses dados segue a política do serviço escolhido; no plano grátis, o Google pode usar o que recebe para melhorar os produtos dele.</li>
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
  <li>The app files (the essentials on the first visit; the rest, such as each game’s tables, when used) and the sprites you have already seen (cache), so it works offline.</li>
</ul>
<p>Clearing the site data in your browser erases all of this.</p>
<h3>Connections the app makes</h3>
<ul>
  <li><b>Hosting</b>: the site is served by Cloudflare Pages. As with any website, the server receives technical data about the visit (such as the IP address).</li>
  <li><b>Sprites</b>: Pokémon images come from the PokeAPI/sprites repository on GitHub (raw.githubusercontent.com), which receives those image requests.</li>
  <li><b>Assistant (AI), optional</b>: only when you tap <b>Rate my party</b> or <b>Build a team</b>, the browser sends directly to the chosen service (Google Gemini or Groq), with <b>your</b> key, the list of your Pokémon (species, nickname, types, ability, item, nature, base stats, IVs and moves), the app’s calculations about the party (weaknesses, coverage, base Speed), in Quetzal and Unbound the public list of moves each member learns by level, and your request, if any. <b>Build a team</b> sends two requests: the first picks the 6; the second, smaller, carries only that team and the app’s calculations about it, for the weaknesses and tips. Not sent: the .sav file, your trainer name, ID and SID, the file name, level, EVs or PID. Before sending, the app shows the exact text of the first request; the second one is shown with the result. That data is handled under the chosen service’s policy; on the free tier, Google may use what it receives to improve its products.</li>
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
