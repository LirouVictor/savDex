# savDex

Site estático (Vite + JS puro) que lê saves de GBA — **Pokémon Quetzal** (ROM hack sobre pokeemerald com engine expandida), **Pokémon Unbound** (ROM hack de FireRed com o motor CFRU), os **jogos oficiais da Gen 3** (Emerald, FireRed/LeafGreen, Ruby/Sapphire) e os de **DS** (Diamond/Pearl, Platinum, HeartGold/SoulSilver, Black/White, Black 2/White 2) —, mostra treinador, equipe e PC e exporta CSV / Showdown / JSON. Aceita `.sav`, o `.dsv` do DeSmuME (save + rodapé, lido como `.sav`) e exports do GameShark/SharkPort (`.sps`) e do Action Replay DS (`.duc`). Save state do DeSmuME (`.dst`, começa com `DeSmuME SState`) gera erro explicando que não é o save. Tudo roda no navegador; nada é enviado a servidor. Alvo principal: Chrome no Android em aparelho de entrada (Redmi Note 11), então **leveza é requisito**: sem framework, sem dependências de runtime, renderizar só o que está visível (uma caixa do PC por vez), sem efeitos caros de CSS.

## Comandos

- `npm run dev` / `npm run build` (saída em `dist/`) / `npm run preview`
- `npm test`: Vitest. Os testes sintéticos sempre rodam; os do save real (`test/parser.fixture.test.js`) só rodam se existirem `fixtures/PokemonQuetzalPtBrAlpha9v0.sav` e `fixtures/PokemonQuetzalPtBrAlpha9v0-pc.sav` (Lucario e Basculegion movidos para a BOX1, posições 21 e 23) e, opcional, `fixtures/PokemonQuetzalPtBrAlpha9v0-3.sav` (Tyranitar e Scorbunny shinys na equipe, Serperior no PC), `fixtures/quetzal-59h.sav` (tempo e dinheiro conferidos na tela do jogo) e `fixtures/quetzal-60h.sav` (insígnias 6 e Pokédex 67 na tela; Haunter e Doublade recém-capturados) e `fixtures/quetzal-60h-haunter.sav` (o mesmo, com o Haunter ferido levado para a equipe), ou `QUETZAL_SAVE` / `QUETZAL_SAVE_PC` / `QUETZAL_SAVE_3` / `QUETZAL_SAVE_59H` / `QUETZAL_SAVE_60H` / `QUETZAL_SAVE_HAUNTER`. **Saves reais não são versionados** (`.gitignore`).
- `npm run tables`: regenera `src/data/*.json` a partir do pokeemerald-expansion e dos CSVs da PokeAPI (precisa de rede). Os JSON são versionados; o build não acessa rede.
- `npm run dex`: regenera `src/data/dex.json` (linhas evolutivas com o método em português e em inglês e golpes por nível do jogo oficial mais recente; golpes ligados aos IDs do expansion pelo nome). Carregado sob demanda ao abrir o detalhe de um Pokémon; aparece como "provável" (o Quetzal pode ter mudado).
- `npm run gen3`: regenera `src/data/gen3.json` (tabelas da Gen 3 oficial a partir do decomp pret/pokeemerald + nomes da PokeAPI).
- Saves reais da Gen 3 para os testes (opcionais, não versionados): `fixtures/emerald.sav` e `fixtures/firered.sav`.
- `npm run nds`: regenera `src/data/nds.json` (itens da Gen 4 e da Gen 5, habilidades, tipos/stats e golpes como eram na época, formas; tudo da PokeAPI). Saves reais para os testes (opcionais): `fixtures/hgss.duc`, `fixtures/bw.duc`, `fixtures/dp.duc` (Diamond/Pearl), `fixtures/dppt.duc` (Platinum) e `fixtures/b2w2.duc` (Black 2).
- `npm run quetzal -- rom.gba`: regenera `src/data/quetzal.json` (itens, golpes e espécies > 898 do Quetzal) a partir da ROM do jogador (padrão: o `.gba` em `fixtures/rom/`; **a ROM nunca é versionada**) e da PokeAPI (precisa de rede). Ver a seção IDs.
- `npm run unbound`: regenera `src/data/unbound.json` (tabelas do Unbound 2.1; ver a seção do Unbound). Saves reais para os testes (opcionais): `fixtures/unbound-a.sav` e `fixtures/unbound-b.sav`. Tudo em `fixtures/` fica fora do git.
- `npm run diff-saves -- a.sav b.sav`: compara dois saves para engenharia reversa (ver `tools/`).

## Estrutura

- `src/parser/load.js`: **porta de entrada**. Tira o embrulho (`container.js`: SharkPort `.sps`), identifica o formato (layout de 16 setores do Quetzal ou 14 setores da Gen 3 oficial) e confere a coerência antes de mostrar qualquer coisa. Save que não bate com nenhum formato gera `SaveError` claro ("não é de um jogo suportado"), nunca dados parciais. `SUPPORTED` lista os jogos (também na tela inicial do `index.html`).
- `src/parser/save.js`: leitura crua do **Quetzal** (só números/textos). Offsets em constantes exportadas (`PARTY`, `PC`, ...).
- `src/parser/gen3.js`: leitura e descrição dos **jogos oficiais da Gen 3** (formato público: Pokémon de 80/100 bytes criptografados com PID ^ OT ID e embaralhados por PID % 24; checksums por Pokémon e por setor). Produz o mesmo formato de `describe()`; `gen3Tables()` adapta as tabelas do app (golpes 1–354 com tipo/poder da Gen 3, tabela de tipos sem Fairy).
- `src/parser/nds.js`: leitura e descrição dos **jogos de DS** (ver a seção abaixo); `nds.json` só é carregado quando o save é de DS (`isNds`). `container.js` tira o cabeçalho do Action Replay DS (`.duc`); se o save não bater depois dele, `load.js` tenta o arquivo inteiro (ver abaixo).
- `src/parser/unbound.js`: leitura e descrição do **Pokémon Unbound** (ver a seção abaixo); as tabelas (`src/data/unbound.json`) só são carregadas quando o save é do Unbound (`isUnbound` em `load.js`, `extraTables` em `app.js`).
- `src/parser/summary.js`: peças do **resumo do save** (`data.summary`: `playTime`, `money`, `badges`, `dex`, cada um com `confidence`; campo não lido não existe). Cada leitor preenche o que conhece; `summaryHtml` (render.js) mostra no card do treinador em blocos coloridos (ícones próprios `clock`/`coin`/`medal`/`dex` no `index.html`, pinos de insígnia, barra da Pokédex); a imagem da equipe (`team-image.js`) ganha uma faixa com tempo de jogo e insígnias. Local atual: fora do escopo (decisão do autor).
- `src/parser/describe.js`: resolve nomes, tipos, natureza, habilidade, nível (pela exp) e marca a confiança de cada dado.
- `src/parser/stats.js`: stats pela fórmula (stats base da PokeAPI), conferência da natureza contra os stats salvos e Hidden Power. `src/parser/natures.js`: tabela de naturezas e natureza pelo PID (byte baixo).
- `src/analysis.js`: fraquezas/resistências e cobertura da equipe (tabela de tipos em `src/data/typechart.json`).
- `src/search.js`: busca e filtros sobre equipe + PC. As janelas Assistente e Buscar são `<details>` fechados por padrão (a escolha fica em `localStorage` `open-ai-win`/`open-search-win`); a lista da busca só é montada quando a janela abre e mostra 15 resultados por página.
- `src/ai/`: assistente opcional com IA (Gemini ou Groq, à escolha; chave do usuário no `localStorage`, chamada direta do navegador; CSP libera `generativelanguage.googleapis.com` e `api.groq.com`). `gemini.js`/`groq.js` são os clientes (mesma interface), `providers.js` escolhe, `http.js` tem as peças comuns. `prompt.js` monta o pedido (sem nível; referências `E1`/`C3-12`) e confere a resposta (só referências que existem). Contas determinísticas ficam no código e a IA só interpreta: `teamFacts` (fraquezas, tipos sem resistência, cobertura, golpes físicos/especiais/status, velocidade base, tipos repetidos, megapedras, clima/terreno), declarados "fonte de verdade" nas regras; nota com critérios fixos (defesa 25%, cobertura 25%, papéis 20%, ameaças 20%, itens 10%); trocas só se resolverem um problema claro, com o que se perde, preservando quem sustenta a estratégia. Na análise vão só `ANALYSIS_PC` (50) candidatos do PC (`analysisPool`: resistem às fraquezas da equipe ou cobrem tipos sem golpe super efetivo, depois stats base), em vez de até 250; no Quetzal/Unbound, a análise também leva os golpes por nível de cada membro (`learnLines`, dex.json) e a IA só cita golpe novo pelo nome se estiver nessa lista; dicas por membro só quando mudam algo concreto (golpe, item, natureza, EVs). Na montagem (`buildPrompt`) vai uma cópia por espécie (`buildPool`, até 250), critérios fixos (físicos × especiais, velocidade ou Trick Room, uma megapedra, nenhum tipo acertando 3+ em cheio) e as pistas de estratégia dos disponíveis (`strategyLines`: quem põe clima/terreno por habilidade ou golpe, quem aproveita por habilidade ou golpe, Trick Room); a IA não afirma fraquezas/contagens da equipe final (ela escolhe sem ver as contas); a tela da equipe montada mostra os mesmos `teamFacts` dela e avisa quando um critério fixo é furado (`buildIssues`); megapedras vão marcadas na linha de cada Pokémon; no Quetzal/Unbound o app confere os golpes novos citados nas dicas (análise e montagem) com os golpes por nível do Pokémon citado mais perto (`moveChecks`, dex.json, carregado também na montagem só para isso) e a equipe montada avisa quem está 15+ níveis abaixo do resto (`levelGap`; o nível nunca vai para a IA); a montagem tem **duas etapas**: depois que a IA escolhe os 6, `sendAi` manda um segundo pedido curto (`refinePrompt`: só a equipe, `teamFacts`, critérios furados e, no Quetzal/Unbound, `learnLines` dela) e troca pontos fortes/fracos e dicas pelos da segunda etapa (`REFINE_SCHEMA`, `checkRefine`); se ela falhar, ficam os da primeira; o texto do segundo envio aparece com o resultado; os clientes devolvem `fallback` e a tela avisa quando a resposta veio de um modelo lite por sobrecarga; nomes de efeito no campo (terrenos, Trick Room…) não entram na conferência de golpes; `view.js` desenha; `index.js` é o pacote carregado sob demanda, em duas etapas: `prepareAi` monta o pedido sem enviar e a janela `#ai-confirm` mostra o que vai/não vai e o texto exato; só `sendAi` envia (a confirmação pode ser desligada em Configurações da IA). Nunca enviar o `.sav` nem dados além dos Pokémon (sem nível, EVs, PID nem dados do treinador).
- `src/demo/`: **save de demonstração** (`demo.js`, carregado só ao tocar em "Ver um save de exemplo"): monta na hora um save do Quetzal com Pokémon fictícios (só espécies/itens conferidos; stats da equipe pela fórmula) usando `quetzal-writer.js`, que também é o gerador dos testes. Nunca grava no save do usuário; o exemplo não vira "último save".
- `src/parser/charset.js`: tabela de caracteres Gen 3.
- `src/i18n.js`: idioma da interface (português padrão; inglês se o navegador não for `pt-*` ou se o usuário escolher no botão EN/PT, salvo em `localStorage` `lang`; a troca recarrega a página). `t('texto em português', { param })`: as chaves são os próprios textos em português; o dicionário inglês fica em `src/i18n/en.js`, num pacote carregado só em inglês (`loadLang()` em `main.js`, com a página escondida até trocar os textos). Textos fixos do `index.html` levam `data-i18n` (conteúdo) ou `data-i18n-attr` (atributos). **Todo texto novo da interface passa por `t()` e ganha tradução em `en.js`**; `test/i18n.test.js` confere as chaves do código e do `index.html` e desenha as telas em inglês procurando textos sem tradução. Dados do parser (gênero, confiança, `where: 'Equipe'`, evidências) ficam em português e são traduzidos na hora de mostrar/exportar. O pedido à IA também sai no idioma da interface. Nos testes (Node) o idioma é sempre português.
- `src/export.js`: CSV (BOM + `;`, padrão do Excel pt-BR), Showdown, JSON.
- `src/history/`: **O que mudou / Histórico**. Ao abrir um save (não o de exemplo), `app.js` guarda a versão no IndexedDB (`ui/store.js`, store `history`, até 30 por save, só se o conteúdo mudou: `signature()`) e compara com a versão anterior diferente (`diffSaves`: novos, saíram, evoluíram, subiram de nível, golpes novos). Cada save é identificado por jogo + TID + SID + nome (`saveKey`). O mesmo Pokémon é achado pelo PID + OT na Gen 3; no Quetzal (o PC não tem PID) pela assinatura IVs + natureza + nº da habilidade + bola + shiny + gênero, que não muda ao evoluir nem ao trocar de lugar (conferido com os saves reais: os Pokémon levados da equipe para o PC não aparecem como novos). Como IVs, natureza e habilidade podem mudar no jogo (itens de treino), quem sobra é pareado de novo por espécie + bola + shiny + gênero (ou pela mesma posição, se evoluiu) com a exp sem diminuir, e aparece como "treinado". A comparação vai sempre da versão mais antiga para a mais nova pelo tempo de jogo (ou pelo contador de saves), mesmo que a mais antiga tenha sido aberta por último (`orderSaves`). Saves reais para o teste (opcionais): `fixtures/quetzal-cmp-old.sav` e `fixtures/quetzal-cmp-new.sav`.
- `src/ui/team-image.js`: **Imagem da equipe** (PNG 1080 px num canvas, carregada sob demanda): sprites do PokeAPI (CORS liberado), fonte Silkscreen, cores de tipo lidas do CSS. Compartilhar pelo `navigator.share` (Android) ou baixar. A CSP libera `blob:` em `img-src` para a prévia.
- `src/pages/`: janelas **Privacidade**, **Termos de uso** e **Novidades** (links do rodapé `#privacidade`, `#termos`, `#novidades`; o endereço com `#` abre a janela). Textos nos dois idiomas em `content.js`, carregado só ao abrir. São janelas e não páginas `.html` porque o service worker serve a página inicial em toda navegação e o Cloudflare Pages redireciona `.html`. **Ao mudar o que o app guarda no aparelho ou envia para fora, atualizar a Privacidade** (e `UPDATED`). Cada mudança visível ganha um item em `NEWS` (pt e en); a data da mais nova também vai em `latest.js` (o rodapé marca "Novidades" até o usuário abrir).
- `src/data/`: tabelas geradas + `quetzal.json` (tabelas da ROM do Quetzal, carregadas só para saves do Quetzal) + `quetzal-overrides.json` (manual: IDs próprios do Quetzal e exceções de item). `move-text.json` (descrições dos golpes) é carregado sob demanda, num pacote separado.
- `src/ui/`, `src/main.js`, `src/styles/`: interface. `src/ui/store.js` guarda uma cópia do último save no IndexedDB (só local) para abrir sozinha na próxima visita.
- `src/sw-template.js` vira `dist/sw.js` no build (plugin em `vite.config.js` injeta a lista de precache). Ele também recebe o `.sav` do menu Compartilhar do Android (`share_target` no manifest → POST `./share` → cache `qsv-share` → `./?shared=1`, lido em `src/main.js`). `public/_headers` tem cache e CSP para o Cloudflare Pages (hash do script inline calculado no build).
- `reference/quetzal-viewer.html`: protótipo original (só referência; não é usado no build).

## Regras do projeto

- **Não chutar.** O que não foi confirmado em save aparece como "não lido" ou "provável" na UI e nas exportações. Ao confirmar algo, atualizar este arquivo.
- Nomes de espécies, golpes, itens e habilidades ficam **em inglês** (o jogo PT-BR também usa inglês para eles; o Showdown exige). A interface é em português.
- Nada de marcas, logos ou assets de UI extraídos dos jogos. Sprites vêm do repositório PokeAPI/sprites por URL.
- Sem `window.claude`; downloads via Blob + `<a download>`.

---

## Gen 3 oficial (Emerald, FireRed/LeafGreen, Ruby/Sapphire) — formato público

Implementado a partir da documentação pública (Bulbapedia/PKHeX) e conferido com saves reais de Emerald e FireRed (os stats salvos de toda a equipe batem com a fórmula, o que valida criptografia, tabelas e natureza/IV/EV):

- 2 slots de **14 setores**; checksum por seção com tamanhos próprios (0: 0xF2C, 4: 0xF08, 13: 0x7D0, demais 0xF80; Ruby/Sapphire mudam as seções 0 e 4, aceitas também).
- Equipe na seção 1: Emerald/Ruby/Sapphire em `0x234` (contagem) / `0x238`; FireRed/LeafGreen em `0x34` / `0x38`. O jogo é identificado pela posição em que os checksums dos Pokémon batem; Ruby/Sapphire × Emerald pelo valor em `0xAC` da seção 0 (0 = Ruby/Sapphire).
- PC: seções 5–13 concatenadas (8 × 3968 + 2000 bytes): caixa atual (u32), 420 Pokémon de 80 bytes, nomes das 14 caixas em `0x8344`.
- Natureza = PID % 25; shiny pela fórmula (TID ^ SID ^ PID alto ^ PID baixo) < 8; gênero pelo byte baixo do PID contra a taxa da espécie; habilidade pelo bit 31 da palavra de IVs; nível do PC pela curva de experiência da espécie.
- O save guarda a **numeração interna** da Gen 3 (Treecko = 277); a tabela `gen3.json` converte para a Dex Nacional (sprites, evoluções, nomes).
- **Resumo**: tempo de jogo na seção 0 (`0x0E` horas u16, `0x10` min, `0x11` s); Pokédex capturados = bits 0–385 em `0x28` da seção 0; dinheiro e flags no SaveBlock1 (seções 1–4, 0xF80 cada): dinheiro em `0x490` (Emerald/RS) ou `0x290` (FR/LG), com XOR da chave da seção 0 (`0xAC` Emerald, `0xF20` FR/LG; RS sem chave); insígnias = 8 flags a partir de `0x867` (Emerald, flags em `0x1270`), `0x807` (RS, `0x1220`), `0x820` (FR/LG, `0xEE0`). Conferido com os saves reais de Emerald e FireRed (999h59m59s, ₽ 999 999 só sai com a chave certa, 8/8, 386/386); Ruby/Sapphire provável.

## Jogos de DS (Gen 4 e Gen 5) — CONFIRMADO com saves reais de Diamond/Pearl, Platinum, HeartGold/SoulSilver, Black e Black 2

Formato público (Project Pokémon/PKHeX), conferido com 5 exports do Action Replay DS: checksums de todos os Pokémon (43 no Diamond/Pearl, 354 no Platinum, 354 no HG/SS, 457 no Black, 458 no Black 2) e stats salvos da equipe = fórmula com os stats base da época (exceto um Vaporeon editado no save de D/P, com 255 EVs em todos os stats).

- **`.duc`**: cabeçalho de 500 bytes que começa com `ARDS000000000001`. Platinum, HG/SS e Black (256 KB): o save vem depois do cabeçalho. Black 2 (512 KB, arquivo de 524 788 bytes): o save começa no byte 0 do arquivo, o cabeçalho **apagou os 500 primeiros bytes dele** (nomes das caixas 1–13) e o arquivo termina com 500 bytes `0xFF`. O app tenta primeiro depois do cabeçalho e, se não bater, o arquivo inteiro (`lost = 500`); os nomes apagados vêm da cópia de segurança das caixas (Black/White `0x24000`, Black 2/White 2 `0x26000`; caixas e nomes iguais aos principais no save real) só se as caixas dela forem idênticas às principais, senão viram `BOX n`.

- **Pokémon** de 136 bytes (+100 de batalha na equipe da Gen 4, +84 na Gen 5): PID, checksum (soma dos u16 dos 128 bytes), 4 blocos de 32 bytes na ordem `ORDERS[((PID >> 13) & 31) % 24]`, criptografados com o gerador do jogo (semente = checksum; dados de batalha com semente = PID). Bloco A: espécie (Dex Nacional), item (numeração da geração), OT ID, exp, amizade, **habilidade (nº nacional)**, EVs. B: golpes, PP, IVs (bit 30 ovo, bit 31 apelido), byte 0x40 (bit 1 fêmea, bit 2 sem gênero, bits 3+ forma); Gen 5: **natureza** em 0x41 e habilidade oculta no bit 0 de 0x42 (Gen 4: natureza = PID % 25). C: apelido. D: OT, bola em 0x83 (HG/SS: 0x86 se preenchido). Posição vazia = PID e checksum 0.
- **Platinum**: bloco geral em `0x0` (0xCF2C bytes) e caixas em `0xCF2C` (0x121E4), cada um com rodapé de **20 bytes** (contador, ?, tamanho, `0x20060623`, id, CRC-16-CCITT dos dados); cópias em `0x0` e `0x40000` (o export tinha só a primeira). Treinador `0x68`, TID `0x78`, SID `0x7A`; equipe: contagem `0x9C`, Pokémon de 236 bytes em `0xA0`; caixa atual (u32) no início do bloco das caixas e 18 caixas **seguidas** (30 × 136 bytes, sem espaço) a partir de `0xCF30`; nomes em `0xCF2C + 0x11EE4` (0x28 cada).
- **Diamond/Pearl**: igual ao Platinum, mas bloco geral com 0xC100 bytes e caixas em `0xC100` (0x121E0); treinador `0x64` (TID `0x74`, SID `0x76`) e equipe `0x94`/`0x98`, como no HG/SS; caixas a partir de `0xC104`, nomes em `0xC100 + 0x11EE4`. O save não diz se é Diamond ou Pearl.
- **HeartGold/SoulSilver**: bloco geral em `0x0` (0xF628 bytes) e caixas em `0xF700` (0x12310), cada um com rodapé de 16 bytes (contador, tamanho, `0x20060623`, id, CRC-16-CCITT dos dados); metades em `0x0` e `0x40000`, vale a mais nova de cada bloco. Treinador `0x64` (nome, texto da Gen 4), TID `0x74`, SID `0x76`; equipe: contagem `0x94`, Pokémon de 236 bytes em `0x98`; 18 caixas de `0x1000` a partir de `0xF700`, nomes em `0xF700 + 0x12008` (0x28 cada).
- **Black/White**: treinador em `0x19404` (UTF-16), TID `0x19414`, SID `0x19416`, versão em `0x1941F` (20 White, 21 Black, 22/23 White 2/Black 2); equipe: contagem `0x18E04`, Pokémon de 220 bytes em `0x18E08`; 24 caixas de `0x1000` a partir de `0x400`, nomes em `0x04` (0x28 cada). **Black 2/White 2**: mesmas posições (conferido com o save real do Black 2, versão 23; formas como Kyurem-Black e as Therian).
- **Resumo**: depois do treinador (Gen 4) vêm dinheiro (+0x14, u32), insígnias (+0x1A, bits; HG/SS: Kanto em +0x1F, total 16) e tempo de jogo (+0x22 horas u16, +0x24 min, +0x25 s). Pokédex: marca `0xBEEFCAFE` e capturados logo depois (D/P `0x12DC`, Pt `0x1328`, HG/SS `0x12B8`; bits 0–492). Gen 5: dinheiro em `0x21200` (B/W) / `0x21100` (B2/W2) com as insígnias 4 bytes depois; tempo em `0x19424`; Pokédex com a marca em `0x21600` / `0x21400` e capturados em +8 (bits 0–648). Conferido nos 5 saves reais (a marca está nas posições indicadas; D/P 24h49m27s, os outros com os valores máximos). Bits além do total da geração (saves editados) não contam.
- Texto da Gen 4: tabela de 16 bits própria; só os caracteres conferidos (A–Z, a–z, 0–9, espaço, `.` `’` `-` `?`), o resto vira `?` (ex.: Pokémon japoneses de evento). Gen 5: UTF-16.
- Shiny = (TID ^ SID ^ PID alto ^ PID baixo) < 8; nível do PC pela curva da espécie; tipos, stats base e golpes **da época** (`nds.json`: Clefairy Normal, Rotom-Wash Electric/Ghost na Gen 4, Charm Normal, sem Fairy); tabela de tipos da Gen 2–5 (a mesma de `gen3.json`). Formas pelo número da forma = `form_order − 1` da PokeAPI.

## Pokémon Unbound (CFRU) — CONFIRMADO com 2 saves reais da versão 2.1

Conferido com 2 saves reais (2.1.1, mesmo treinador): os stats salvos dos 8 Pokémon de equipe batem exatamente com a fórmula usando os stats base do Unbound, o que valida espécie, stats base, natureza (PID % 25), IVs e EVs. Formato e posições das caixas também conferidos com o leitor do Unbound Cloud (Skeli789/Unbound-Cloud, do autor do Unbound; sem licença declarada, usado só como referência).

- 2 slots de **14 setores** (como o FireRed). Assinatura `0x01121999` = Unbound 2.1.0–2.1.1.1 (suportado); `0x01122000` = versões seguintes (abre com aviso: as tabelas são as da 2.1, que só ganharam itens no fim nas versões novas; 31 espécies tiveram stats/habilidades ajustados); `0x01121998` = 2.0 (erro claro, não suportado). Checksum com 0xFF0 bytes (seções 0, 4 e 13: 0xF24, 0xD98, 0x450).
- Treinador na seção 0 (nome, TID `0xA`, SID `0xC`). Tempo de jogo na posição do FireRed (`0x0E`), **provável** (os 2 saves reais têm o máximo, 999h59m59s). Dinheiro, insígnias e Pokédex ainda não (o CFRU guarda a Pokédex expandida em outro lugar; precisa de saves pareados).
- **Equipe**: seção 1, contagem `0x34` (u32), Pokémon de 100 bytes em `0x38`, **sem criptografia** e com os blocos sempre na ordem Growth/Attacks/EVs/Misc (checksum 0). Poké Ball no byte 10 do bloco Growth; IVs/ovo/habilidade oculta na palavra em +4 do bloco Misc (bit 30 ovo, bit 31 oculta). Nível e stats salvos.
- **PC**: 25 caixas de Pokémon de **58 bytes** ("comprimidos", sem criptografia): PID, OT ID, apelido, OT, espécie (28), item (30), exp (32), PP Ups (36), amizade (37), bola (38), 4 golpes de 10 bits (39–43), EVs (44–49), origem (52), IVs/ovo/oculta (54). Sem PP (calculado com o PP oficial e os PP Ups) nem stats (fórmula). Caixas 1–19 nas seções 5–13 (depois da caixa atual, u32); 20–22 nos setores **físicos** 30 (`0xB0C`–`0xFF0`) e 31 (`0`–`0xF80`); 23–24 nas seções 2 (`0xF18`–`0xFF0`) e 3 (`0`–`0xCC0`); 25 na seção 0 (`0xB0`). Nomes das caixas na seção 13, `0x361`, 9 bytes cada. **Conferidos com dados**: caixas 1–7 e 25 (3 Eternatus); 20–24 estavam vazias nos saves vistos.
- Natureza = PID % 25; shiny = (TID ^ SID ^ PID alto ^ PID baixo) < **16** (1/4096); habilidade: oculta pelo bit, senão PID & 1 (1ª/2ª); gênero pelo byte baixo do PID contra a taxa da espécie; nível do PC pela curva da espécie.
- **Tabelas** (`tools/build-unbound.mjs`): espécies, Dex Nacional, stats base, tipos, habilidades, gênero e curva do Unbound vêm do branch `Unbound` do Skeli789/Dynamic-Pokemon-Expansion (WTFPL); bolas do CFRU (`catching.h`, enum começando em 0 = Master Ball); 97 itens que os cabeçalhos públicos deixam sem nome (ex.: `0x37` Life Orb, `0xB1` Choice Specs) conferidos com as tabelas do Unbound 2.1 do Unbound Cloud. Golpes ligados aos IDs do app pelo nome (tipo, poder, descrição); PP oficial da PokeAPI (o expansion difere em alguns, ex.: Night Slash). Formas pelo nome da constante (`RAICHU_A` = Raichu de Alola) e sprites pelas formas da PokeAPI; sem forma correspondente, sprite da espécie base. Leech Fang e Steely Hit são golpes próprios (só nome).

## Formato do save (Quetzal)

Arquivo de 128 KB (0x20000) = 2 slots × 16 setores de 4 KB (0x1000).

### Setores — CONFIRMADO

| Offset no setor | Tamanho | Campo |
|---|---|---|
| 0x000–0xFF3 | 0xFF4 | dados |
| 0xFF4 | u16 | section ID (0–15) |
| 0xFF6 | u16 | checksum |
| 0xFF8 | u32 | assinatura `0x08012025` |
| 0xFFC | u32 | save index |

- Slot válido = o de maior save index (no save de referência: 80 contra 79).
- Os setores podem estar em qualquer ordem física; o section ID diz qual é qual.
- Checksum: soma dos u32 LE dos **0xFF4** bytes de dados (para todas as seções), depois `(sum >> 16) + (sum & 0xFFFF)` truncado a 16 bits. Conferido em todas as 32 seções do save de referência. O parser prefere o slot mais recente com checksums íntegros.

### Seção 0 (treinador) — CONFIRMADO

| Offset | Tipo | Campo |
|---|---|---|
| 0x00 | 7 bytes texto | nome |
| 0x0A | u16 | TID |
| 0x0C | u16 | SID |
| 0x10 | u16 | **tempo de jogo, horas** |
| 0x14 | u8 | minutos |
| 0x15 | u8 | segundos; `0x16` parece o contador de quadros (< 60) |
| 0x2C | u32 | **chave** do dinheiro (muda a cada save) |

- Tempo de jogo 2 bytes depois da posição da Gen 3 oficial (`0x0E` fica 0). **Confirmado**: save com 59h20m49s e a tela do jogo, aberta logo depois de salvar, com 59:21:18; nos saves antigos cresce na ordem (51h55m16s → 52h04m00s → 52h26m41s).
- **Dinheiro** = u32 em `0x918` da **seção 1** XOR a chave (`0x2C` da seção 0), como no Emerald mas em outras posições. **Confirmado**: ₽ 1 247 386 na tela e no save; nos 3 saves antigos a chave muda e o valor é sempre ₽ 1 315 986.
- **Insígnias** (confirmado): 8 flags na seção 1 a partir do bit 6 de `0x151` (como no Emerald, que começa num bit 7). 5 no save de 52h (o autor tinha 5) e 6 nos de 59h e 60h (a tela de salvar mostra 6).
- **Pokédex** (confirmado): capturados pela **Dex Nacional** (bit n−1 = espécie n, inclusive a Gen 9: Annihilape 979, Baxcalibur 998) na **seção 4**, `0x9D0`, logo depois do bloco marcado `ROP` (`0x9B4`; o app só lê se a marca estiver lá). A seção 4 tem outros blocos marcados (`ITM`, `RGN`, `RLG`, `DEX`, `HLP`, `AGR`). Entre os saves de 52h e de 59h vai de 63 a 65 com exatamente Feebas (349) e Froakie (656) a mais; no de 60h, 67 com Haunter (93) e Doublade (680), e a tela de salvar mostra **Pokédex 67**. Os capturados são as linhas evolutivas dos Pokémon do autor. Total mostrado: 1025 (Dex Nacional do expansion; a tela do jogo mostra só os capturados). "Vistos" não foi achado (não é um superconjunto logo depois).

### Texto

Charset Gen 3 ocidental (`0xBB`=A, `0xD5`=a, `0xA1`=0, `0x00`=espaço, `0xFF`=fim). Ver `charset.js`. **Hipótese**: a tradução PT-BR pode usar códigos próprios para letras acentuadas (ã, õ...); ainda não testado com um apelido acentuado.

### Seção 1 (equipe) — CONFIRMADO salvo indicação

Contagem em `0x6A4` (u8). Registros a partir de `0x6A8`, **104 bytes (0x68), sem criptografia**.

| Offset | Tipo | Campo | Status |
|---|---|---|---|
| 0x00 | u32 | PID | confirmado |
| 0x04 | u32 | OT ID (TID baixo, SID alto) | confirmado |
| 0x08 | 10 bytes | apelido | confirmado |
| 0x13 | u8 | flags: bit 3 (`0x08`) = **shiny**; bit 1 sempre 1 (desconhecido) | confirmado (3 shinys — Serperior, Tyranitar, Scorbunny, todos conferidos no jogo pelo autor — e 9 não shinys) |
| 0x14 | 7 bytes | nome do OT | confirmado |
| 0x23 | u16 (desalinhado) | **HP atual** | confirmado (Haunter ferido com 33 de 66, "metade" no jogo; Pelipper 243 de 324; os outros cheios) |
| 0x28 | u16 | espécie | confirmado |
| 0x2A | u16 | item | confirmado |
| 0x2C | u32 | experiência | confirmado |
| 0x30 | u8 | `0xFF` em todos | desconhecido |
| 0x31 | u8 | amizade (0 em Pokémon recém-tirados do PC, que não guarda amizade) | confirmado |
| 0x32 | u8 | **Poké Ball** (enum `PokeBall` do expansion) | confirmado (6 Pokémon cruzados com o PC) |
| 0x34 | 4×u16 | golpes | confirmado |
| 0x3C | 4×u8 | PP | confirmado (ver observação) |
| 0x40 | 6×u8 | EVs HP/Atk/Def/Spe/SpA/SpD | confirmado |
| 0x50 | u32 | IVs, 5 bits cada, mesma ordem | confirmado |
| 0x54 | u32 | bits 28–29 = **número da habilidade** (0 = 1ª, 1 = 2ª, 2 = oculta). Bit 30 sempre 1 (desconhecido); demais bits 0 nos saves vistos | confirmado (6 habilidades conferidas no jogo + 6 Pokémon cruzados com o PC) |
| 0x58 | u8 | nível | confirmado |
| 0x59 | u8 | `0xFF` em todos (mail?) | desconhecido |
| 0x5A | 6×u16 | stats HP/Atk/Def/Spe/SpA/SpD | confirmado |
| 0x66 | u16 | varia (`0000`, `2202`, `1111`); não é o HP atual | desconhecido |

- **Natureza = (PID & 0xFF) % 25** (o byte baixo do PID, não o PID inteiro). O jogo monta o PID como `225 + natureza` nos machos e `256 + natureza` nas fêmeas. Conferido em 12 Pokémon; explica o caso do Serperior (PID `0x1F0`: PID % 25 daria Gentle, o byte baixo dá Modest, a natureza mostrada no jogo) e do Tyranitar (`0x10F`). Por segurança o app ainda confere a natureza contra os stats salvos (`pidNature` fica `null` em todos os saves vistos).
- **Gênero** = regra da geração 3: fêmea se `(PID & 0xFF)` for menor que o limite da espécie (taxa de fêmeas em oitavos → 31, 63, 127, 191, 223); espécies sem gênero ou de gênero fixo seguem a espécie. Conferido: Tyranitar fêmea (`0x0F` < 127) e 11 machos.
- **Stats** = fórmula padrão das gerações 3+ com os stats base oficiais (PokeAPI): reproduz exatamente os stats salvos de todas as espécies vistas na equipe.
- **HP atual**: u16 em `0x23` (ver tabela). A UI mostra "atual/máximo" no detalhe só quando o Pokémon está ferido.
- Observação: todos os PP observados (equipe e PC) estão no máximo com 3 PP Ups (ex.: Tackle 56 = 35 × 1,6), até em Pokémon recém-capturados. Pode ser regra do Quetzal; não confirmado se o campo é o PP atual.

### Seções 5–15 (PC) — CONFIRMADO salvo indicação

Concatenar os 0xFF4 bytes de dados de cada seção, em ordem de section ID (44 924 bytes no total).

| Offset | Campo | Status |
|---|---|---|
| 0x000 | caixa atual (u8) | provável |
| 0x001 | nomes das caixas, 9 bytes cada, espaço para 67 | confirmado ("BOX1".."BOX67" no save de referência) |
| 0x25C | 67 bytes de wallpaper (0,1,2,3 repetindo) | provável |
| 0x461 | Pokémon, **38 bytes cada**, 30 por caixa, **37 caixas** | confirmado |

O jogo mostra **37 caixas** (confirmado pelo autor): 1 110 registros, até 0x461 + 1110×38 = 0xA917. Os 1 623 bytes seguintes da área do PC não foram investigados. Os nomes de caixa têm espaço para 67, mas só os 37 primeiros são usados.

Registro de 38 bytes. Bits contados em little-endian a partir do byte 0 (bit *n* = bit `n % 8` do byte `n / 8`):

| Bits | Largura | Campo | Status |
|---|---|---|---|
| 0–10 | 11 | espécie | confirmado |
| 11–20 | 10 | item | confirmado |
| 21–37 | 17 | **experiência ÷ 10** | confirmado (6 Pokémon cruzados com a equipe) |
| 38–43 | 6 | **Poké Ball** (enum `PokeBall`: 1 Poké, 2 Great, 3 Ultra, 5 Premier conferidos no jogo; 25 = **Radiant Ball**, própria do Quetzal). Bit 43 sempre 0; a largura pode ser 5 | confirmado |
| 44 | 1 | **shiny** | confirmado (os shinys da BOX1, e só eles; o Serperior levado da equipe também tem o bit, igual ao bit 3 de `0x13` da equipe) |
| 45–47 | 3 | desconhecido | pendente |
| 48–87 | 4×10 | golpes | confirmado |
| 88–123 | 6×6 | **EVs ÷ 4**, ordem HP/Atk/Def/Spe/SpA/SpD | confirmado (6 Pokémon) |
| 124–153 | 6×5 | IVs, mesma ordem | confirmado (6 Pokémon) |
| 154–159 | 6 | desconhecido (só o Arcanine tem um bit ligado: 155) | pendente |
| 160 | 1 | **fêmea** (1) / macho (0). Ignorado em espécies sem gênero ou de gênero fixo (o Golett, sem gênero, tem 1); o app usa a taxa de gênero da espécie (PokeAPI) nesses casos | confirmado (12 Pokémon: 6 machos e 6 fêmeas) |
| 161–165 | 5 | natureza (0–24, mesma ordem) | confirmado (8 Pokémon cruzados com a equipe, inclusive o Serperior: Modest) |
| 166–167 | 2 | número da habilidade (0/1/2), igual a `0x54` da equipe | confirmado (6 Pokémon + sets coerentes) |
| 168–183 | 16 | **HP atual** | confirmado (igual ao HP máximo calculado em 82 de 86 Pokémon; o Haunter capturado ferido tem 33, o mesmo valor depois de ir para a equipe; o Pikachu "estilo Red" tem 68 contra 62 calculados com os stats do Pikachu: forma própria com stats próprios) |
| 184–191 | 8 | desconhecido (0 em todos) | pendente |
| bytes 24–27 | | PP dos 4 golpes | confirmado |
| bytes 28–37 | | apelido (vazio = usar nome da espécie) | confirmado |

- "Cruzado" = Pokémon que aparece na equipe de um save e no PC de outro (Lucario, Basculegion, Arcanine, Baxcalibur, Corviknight, Rillaboom): item, exp, natureza, habilidade, IVs e EVs batem exatamente. O teste `equipe → PC` cobre isso.
- O registro do PC **não tem** PID, OT, amizade nem stats. O app calcula os stats pela mesma fórmula (nos 6 Pokémon cruzados, os stats calculados no PC são iguais aos salvos na equipe).
- **Nível**: não é guardado; vem da experiência. Todos os Pokémon nível 100 vistos (inclusive espécies "Slow", como Dragonite e Baxcalibur, e "Medium Fast", como Basculegion) têm exatamente 1 059 860 de exp, o máximo da curva **Medium Slow**: o Quetzal usa essa curva para todas as espécies. **Confirmado** no jogo pelo autor com níveis calculados do PC (Scizor 59, Blaziken 92, Pelipper 26).
- EVs ÷ 4: o PC só guarda múltiplos de 4.
- Com 11 bits, o PC só representa espécies até 2047.

### IDs — CONFIRMADO pela ROM do jogo

Tabelas lidas da ROM do Quetzal Alpha 9 PT-BR (`npm run quetzal`, `tools/build-quetzal.mjs`; a ROM fica em `fixtures/rom/`, **nunca versionada**) e gravadas em `src/data/quetzal.json` (só nomes e números; carregado sob demanda para saves do Quetzal: `extraTables` em `app.js` → `loadSave(..., Q)` → `T.quetzal` em `describe.js`). O script acha as tabelas por assinatura e só grava se bater com tudo o que já tinha sido confirmado nos saves. Com elas, os 8 saves reais ficam com todas as espécies, itens e golpes confirmados, os stats salvos da equipe batem com a fórmula e o HP do PC bate com o calculado (teste `tabelas da ROM contra os saves reais`).

- **Espécies 1–898** = Dex Nacional: na ROM, nomes, tipos, stats base e habilidades iguais aos da PokeAPI (as que o app já usa) e curva **Medium Slow em todas** (byte 21 = 3). Nomes de 13 bytes; dados de 36 bytes por espécie (0–5 stats HP/Atk/Def/Spe/SpA/SpD, 6–7 tipos no enum com Mystery = 9, 18 gênero, 21 curva, 24–29 habilidades em u16 pela numeração nacional).
- **Espécies 899–1528** = numeração própria: 899–948 megas e primais, 949–985 formas regionais, 986–1206 formas (Pikachu, Unown, Rotom, Arceus…), 1207–1213 Hisui (Wyrdeer–Enamorus), 1214–1222 iniciais da Gen 9, 1223–1243 formas de Hisui e de origem, 1244–1339 Gen 9, 1340–1434 formas (Gen 9, Paldea, Alcremie), 1435–1468 Gigantamax, 1469 Pikachu "estilo Red", 1470 Eevee Partner, 1471–1519 megas novas (Z-A), 1520–1528 Pokémon próprios do Quetzal (Browt, Pombon e Gecqua, com evoluções "2" e "3"). Nome, tipos, stats, habilidades e gênero vêm da ROM; a forma da PokeAPI (sprite, nome no Showdown) é achada pelo nome + tipos + stats: 425 com forma única, 162 só de aparência (Vivillon, Alcremie, Gigantamax…: sprite da forma padrão) e 43 sem correspondência (Arceus/Silvally por tipo e os próprios do Quetzal: silhueta). `quetzal-overrides.json` ainda vale por cima da ROM para nome, forma e sprite conferidos no jogo:

  | ID | Espécie | Evidência |
  |---|---|---|
  | 951 | Raichu (Alola) | confirmado no jogo e na ROM |
  | 973 | Weezing (Galar) | confirmado no jogo e na ROM |
  | 1210 | Basculegion (macho; a fêmea é 1240) | confirmado no jogo; gênero pela ROM |
  | 1224 | Arcanine (Hisui) | confirmado no jogo e na ROM |
  | 1308 | Annihilape | confirmado pelo autor e na ROM |
  | 1327 | Baxcalibur | confirmado pelo autor e na ROM |
  | 1469 | Pikachu "estilo Red" (boné branco/vermelho e jaqueta vermelha) | confirmado no jogo; na ROM, stats do Pikachu Partner (por isso o HP 68); visual próprio, silhueta |
- **Itens** (ROM, nomes de 20 bytes; 1–889, depois começa a tabela em espanhol): os 15 confirmados no jogo batem. Diferenças para o expansion master: 25 Radiant Ball, 71/72 **IV Up / IV Max** (no master, PP Up/PP Max), 108 Giga Candy, TM51–TM100 não existem (632–681 vazios) e o **deslocamento começa no 758** (Adamant Crystal e Lustrous Globe em outra posição, Prop Case, Pastry Bag, Reset Tera Shard, Gender Pill, Max Candy, megapedras do Z-A…). Sem a ROM, o app volta à regra antiga (`itemsVerifiedUpTo`/`itemsDivergeFrom`).
- **Golpes**: a numeração da ROM é a do expansion master de 1 a 847 (três nomes vêm abreviados na ROM, ex.: "Floral Healng"); o 848 é **Nihil Light** (só o nome é conhecido; tipo e poder ficam "?"). Golpes > 848 não existem no Quetzal.
- **Habilidades**: o save guarda só o número (1ª/2ª/oculta); o nome vem da espécie (ROM para > 898, PokeAPI para ≤ 898, iguais na ROM). Se o slot estiver vazio, vale a primeira habilidade existente (como no expansion). Conferido com as 6 habilidades da equipe informadas pelo autor.

## Pendências de engenharia reversa

Resolvidas: resumo do save (tempo de jogo, dinheiro, insígnias, Pokédex), HP atual (equipe e PC), habilidade da equipe (`0x54`), item/exp/natureza/IVs/EVs/habilidade no PC, número de caixas (37), curva de nível (Medium Slow para todas as espécies), Poké Ball (equipe e PC), shiny e gênero (PC e equipe), natureza da equipe pelo byte baixo do PID (fim da "natureza trocada"), tabela de itens e de espécies > 898 (pela ROM).

1. PC: bits 45–47, 154–159 e 184–191 (0 nos recém-capturados; o PC parece não guardar local nem nível de captura).
2. Equipe: significado de `0x59`, `0x66`, do bit 1 de `0x13` e do bit 30 de `0x54`.
3. ROM (próximos passos possíveis): golpes por nível e evoluções do próprio Quetzal (hoje vêm dos jogos oficiais, como "provável"), tipo/poder dos golpes e os nomes das bolas.

Método: saves pareados com uma única mudança no jogo + `tools/diff-saves.mjs`.
