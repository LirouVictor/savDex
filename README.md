# savDex

Visualizador de saves de Pokémon de GBA: **Pokémon Quetzal**, **Pokémon Unbound** e **Pokémon SoulGold** (ROM hacks) e os jogos oficiais da Gen 3 (**Emerald**, **FireRed/LeafGreen**, **Ruby/Sapphire**). Também lê saves de DS (**Diamond/Pearl**, **Platinum**, **HeartGold/SoulSilver**, **Black/White**, **Black 2/White 2**). Abra o `.sav` do emulador (ou o `.dsv` do DeSmuME, o `.sps` do GameShark/SharkPort ou o `.duc` do Action Replay DS) e veja treinador, equipe e PC. Dá para exportar tudo em planilha (CSV), texto do Pokémon Showdown ou JSON.

- **100% local:** o save é lido no navegador e não é enviado a nenhum servidor. A única exceção é opcional: o **Assistente (IA)** manda a lista dos Pokémon (nunca o `.sav`) ao serviço de IA escolhido (Gemini ou Groq) quando você toca num dos botões dele.
- **Leve:** sem framework. A página inicial pesa uns 8 KB comprimidos (sem as fontes). O parser e as tabelas (~29 KB comprimidos) só carregam quando você abre um save.
- **Offline (PWA):** depois da primeira visita, o app funciona sem internet. Na instalação ele guarda só o essencial; as tabelas de cada jogo, a IA e os textos ficam guardados na primeira vez que são usados. Os sprites já vistos também ficam guardados.
- **Português e inglês:** o idioma segue o do navegador (português para `pt-*`, inglês para os demais) e pode ser trocado no botão **EN/PT** da barra superior. A escolha fica salva no aparelho. *English available: the app follows your browser language, or use the EN/PT button.*

> Projeto de fã, sem vínculo com Nintendo, Game Freak, The Pokémon Company ou com os autores do Quetzal. Privacidade, termos de uso e novidades: links no rodapé do app. Sprites carregados do repositório [PokeAPI/sprites](https://github.com/PokeAPI/sprites).

## Como usar

Sem jogo ou sem arquivo? Toque em **Ver um save de exemplo** na tela inicial: abre um save do Quetzal com Pokémon fictícios, montado na hora.

1. Abra o site no Chrome do Android (ou em qualquer navegador moderno).
2. Toque em **Abrir arquivo .sav** e escolha o save na pasta do emulador (My Boy!, Pizza Boy, RetroArch…). No computador, também dá para arrastar o arquivo para a página.
3. Para instalar como app: menu do Chrome → **Instalar app** / **Adicionar à tela inicial**.
4. Com o app instalado, dá para abrir o save sem passar pelo seletor: no gerenciador de arquivos, segure o `.sav` → **Compartilhar** → **savDex**. (Se o app já estava instalado antes dessa função, desinstale e instale de novo para ele aparecer no menu.)
5. Uma cópia do último save aberto fica guardada no navegador (IndexedDB, só neste aparelho) e abre sozinha na próxima visita. Para ver o progresso mais recente, abra o `.sav` de novo. O botão **Esquecer este save** apaga a cópia.

### Jogos suportados

- **Pokémon Quetzal** (testado na Alpha 9 PT-BR; o save não guarda a versão do jogo).
- **Pokémon Emerald** e **FireRed/LeafGreen** (conferidos com saves reais).
- **Pokémon Ruby/Sapphire** (mesmo formato do Emerald; ainda sem save real para testar).
- **Pokémon Diamond/Pearl**, **Platinum**, **HeartGold/SoulSilver**, **Black/White** e **Black 2/White 2** (DS; conferidos com saves reais). Save state do emulador (`.dst`) não é o save do jogo e mostra um aviso.
- **Pokémon Unbound** (versão 2.1 em diante; conferido com saves reais da 2.1.0 e da 2.1.1). Versões mais novas abrem com um aviso, e a 2.0 ainda não é suportada.
- **Pokémon SoulGold** (hack de Emerald ambientado em Johto; conferido no próprio jogo com um save do começo. O PC ainda não foi conferido com Pokémon dentro).
- Hacks que mantêm o formato de um desses jogos também abrem, mas nomes de espécies, golpes e itens podem não bater se o hack os mudou.

No card do treinador aparece o **resumo do save**: tempo de jogo, dinheiro, insígnias e Pokédex (capturados contra o total do jogo) nos jogos oficiais; no Quetzal, tempo de jogo, dinheiro, insígnias e Pokédex; no Unbound, os mesmos quatro (a Pokédex Nacional do jogo vai até o 809); no SoulGold, os mesmos quatro (Pokédex de Johto, 702).

O app identifica o formato antes de ler. Um save que não bate com nenhum formato conhecido mostra um aviso ("não é de um jogo suportado"), em vez de dados parecidos com os certos.

### O que é lido hoje (Quetzal)

| | Equipe | PC |
|---|---|---|
| Espécie, apelido, golpes, PP | ✅ | ✅ |
| Natureza, item, habilidade, IVs, EVs | ✅ | ✅ |
| Poké Ball | ✅ | ✅ |
| Shiny | ✅ | ✅ |
| Gênero | ✅ (pelo PID) | ✅ |
| Experiência | ✅ | ✅ (o jogo guarda ÷ 10) |
| Nível | ✅ | calculado pela experiência (curva conferida no jogo) |
| Stats | ✅ | calculados (stats base + nível, IVs, EVs, natureza) |
| HP atual | provável (`0x23`), ainda não mostrado | — |

Também tem:
- **Busca** na equipe e em todas as caixas (nome, espécie, golpe, habilidade, item), com filtros (tipo, shiny, habilidade oculta, gênero, 6 IVs 31) e ordenação;
- **Análise da equipe**: fraquezas, resistências e imunidades por tipo, e cobertura dos golpes;
- **Detalhes dos golpes** (poder, precisão, categoria, descrição) ao tocar no golpe;
- No detalhe de cada Pokémon: **dano recebido** por tipo (4×, 2×, ½, ¼, imune), **linha evolutiva** com o método de cada evolução e **golpes por nível** (no Quetzal e no Unbound, as tabelas do próprio jogo; nos demais, as dos jogos oficiais, marcadas como "provável");
- **Hidden Power** de cada Pokémon.
- **O que mudou**: ao abrir o save de novo depois de jogar, mostra quem chegou, evoluiu, subiu de nível, aprendeu golpes ou saiu desde a versão anterior (histórico de até 30 versões, só neste aparelho).
- **Imagem da equipe**: um PNG com sprites, tipos, item, habilidade, natureza e golpes, para compartilhar ou baixar.
- **Assistente (IA, opcional)**: com uma chave grátis do Gemini ou do Groq, avalia a equipe (nota, pontos fortes e fracos, sinergia, trocas com o PC, dicas) ou monta uma equipe com os Pokémon da equipe e do PC. Veja a seção abaixo.

Itens, golpes e espécies com ID próprio do Quetzal (acima de 898: formas regionais, megas, Gen 9 e os Pokémon próprios do jogo) vêm de tabelas lidas da ROM do jogo e conferidas com saves reais. No Unbound, as tabelas montadas a partir do código público do jogo foram conferidas com a ROM, que também dá os nomes dos itens, os dados dos golpes, as evoluções e os golpes por nível. As ROMs não fazem parte do repositório: os arquivos gerados têm só nomes e números. Os detalhes técnicos estão em [`CLAUDE.md`](CLAUDE.md).

## Assistente (IA)

Dois serviços, à escolha em **Serviço de IA** (cada um com chave grátis própria):

| Serviço | Chave | Observação |
|---|---|---|
| **Gemini** (Google) | <https://aistudio.google.com/apikey> | contexto grande (manda até 250 Pokémon do PC); no plano grátis, às vezes responde 503 ("high demand") |
| **Groq** | <https://console.groq.com/keys> | modelos abertos (gpt-oss, Llama, Qwen), rápido; o limite grátis de tokens por minuto é menor, então vão até 60 Pokémon (equipe + PC) |

1. Escolha o serviço, crie a chave no link e cole na janela **Assistente** (**Salvar chave**). Ela fica só neste aparelho (`localStorage`); **Apagar chave deste aparelho** remove.
2. **Analisar minha equipe** ou **Montar equipe**. Antes de enviar, abre uma janela com o que vai (quantos Pokémon e quais dados de cada um), o que não vai (o `.sav`, nome do treinador, ID/SID, nível, EVs…) e o texto exato do pedido, com **Cancelar** e **Enviar**. Dá para desligar essa pergunta em **Configurações da IA**. O resto do app funciona sem IA e sem chave. O campo **Pedido** aceita um desejo livre ("quero usar o Lucario", "sem lendários").

Como funciona (`src/ai/`):
- O navegador chama a API do serviço direto, com a chave do usuário (`gemini.js`, `groq.js`; peças comuns em `http.js`; escolha do serviço em `providers.js`).
- Modelo: no Gemini, o padrão é `gemini-flash-latest`; se ele deixar de existir, o app escolhe outro "flash" e guarda. No Groq, o app escolhe sozinho o melhor modelo da chave na primeira vez (gpt-oss-120b, Llama 3.3 70B…) e guarda. Em **Configurações da IA** dá para ver os modelos da chave e trocar.
- Sobrecarga ou erro interno (5xx): o app tenta de novo e depois outros modelos da mesma chave (no Gemini, o melhor de cada grupo primeiro: estável, "lite", "preview"), sem guardar a troca. A mensagem de erro mostra o código, o texto do serviço e os modelos tentados.
- O pedido (`prompt.js`) leva uma linha por Pokémon: referência (`E1` = equipe 1, `C3-12` = caixa 3, posição 12), espécie, tipos, habilidade, item, natureza, stats base, IVs e golpes (tipo, categoria e poder). **Sem nível**, porque o jogador pode treinar qualquer um. PC: maior total de stats base primeiro, no máximo 2 da mesma espécie.
- Resposta em JSON: no Gemini, com schema nativo; no Groq, em modo JSON com o formato descrito no próprio pedido (`schemaHint`). Ela é conferida: trocas, dicas e membros que citam referências inexistentes são descartados e avisados; a equipe montada não repete espécie. As telas (`view.js`) desenham os Pokémon com os dados do save, e a equipe montada passa também pela análise de tipos do próprio app.

## Desenvolvimento

Requer Node 22 (ver `.node-version`).

```bash
npm install
npm run dev        # servidor local com hot reload
npm test           # testes (Vitest)
npm run build      # gera dist/
npm run preview    # serve dist/ (com service worker) em http://localhost:4173
```

### Testes com um save real

Saves reais **não** são versionados. Para rodar também os testes contra saves reais, coloque os arquivos em `fixtures/PokemonQuetzalPtBrAlpha9v0.sav` e `fixtures/PokemonQuetzalPtBrAlpha9v0-pc.sav` (ou defina `QUETZAL_SAVE` / `QUETZAL_SAVE_PC`). Sem ele, esses testes são pulados e os testes com saves sintéticos rodam normalmente.

### Tabelas de nomes e tipos

Os arquivos em `src/data/*.json` são gerados e versionados. O build não acessa a rede.

```bash
npm run tables     # baixa do pokeemerald-expansion e da PokeAPI e regenera src/data/*.json
npm run dex        # evoluções e golpes por nível (PokeAPI) → src/data/dex.json
npm run quetzal    # tabelas do Quetzal a partir da ROM em fixtures/rom/ → src/data/quetzal*.json
npm run unbound    # tabelas do Unbound (código público + ROM em fixtures/rom/) → src/data/unbound*.json
npm run soulgold   # tabelas do SoulGold a partir da ROM em fixtures/rom/ → src/data/soulgold.json
```

`src/data/quetzal-overrides.json` é mantido à mão: tem as espécies com ID próprio do Quetzal e as exceções de item.

### Ferramentas de engenharia reversa

```bash
npm run diff-saves -- antes.sav depois.sav            # o que mudou entre dois saves
npm run diff-saves -- antes.sav depois.sav --party 1  # diff bit a bit do 1º da equipe
npm run diff-saves -- antes.sav depois.sav --pc 1 5   # diff bit a bit da caixa 1, posição 5
npm run diff-saves -- save.sav --pc 1 5               # mostra o registro em hex e bits
```

### Ícones

Os ícones do app (as letras "sD" em pixel art com uma esfera de captura dentro do D, nas cores do app; desenho original, sem copiar a Poké Ball) são gerados por `node tools/make-icons.mjs` em `public/icons/`. O script também imprime os `<path>` do logo para o `<symbol id="logo">` do `index.html`.

## Deploy no Cloudflare Pages

O build é estático e fica em `dist/`. Os caminhos são relativos (`base: './'`), então o mesmo build funciona na raiz de um domínio ou numa subpasta.

### Opção A: integração com o GitHub (recomendada, sem tokens; é como o site está publicado hoje, em https://savdex.pages.dev)

1. No painel da Cloudflare: **Workers & Pages → Create → Pages → Connect to Git** e escolha este repositório.
2. Configuração de build:
   - **Framework preset:** None (ou Vite)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Production branch:** `main`
3. Salve. Cada push na `main` publica o site, e os outros branches geram URLs de prévia.

A Cloudflare lê a versão do Node em `.node-version`. Se precisar, defina `NODE_VERSION=22` em *Settings → Environment variables*.

### Opção B: upload direto com o Wrangler

```bash
npm run build
npx wrangler pages deploy dist --project-name savdex
```

### Cabeçalhos

`public/_headers` vai junto para o `dist/` e configura:

- cache longo para `assets/*` (os nomes têm hash) e `no-cache` para `index.html`, `sw.js` e o manifest;
- Content-Security-Policy restrita: scripts só do próprio site, imagens só do site e de `raw.githubusercontent.com`, conexões só com o site, `raw.githubusercontent.com` e as APIs do Gemini e do Groq. O hash do script inline de tema é calculado no build.

## GitHub Pages (alternativa)

Funciona sem mudar nada, porque os caminhos são relativos. Publique o conteúdo de `dist/` (por exemplo, com a action `actions/deploy-pages`). O arquivo `_headers` é ignorado pelo GitHub Pages.

## PWA e APK

- `public/manifest.webmanifest` tem nome, ícones 192/512 (inclusive *maskable*), `display: standalone` e `start_url`/`scope` relativos.
- O service worker (`src/sw-template.js`, gerado como `dist/sw.js` no build) guarda na instalação só o essencial (~112 KB compactados), guarda os pacotes sob demanda na primeira vez que são usados e guarda até 1500 sprites já vistos.
- `share_target` no manifest: o app instalado aparece no menu **Compartilhar** do Android. O service worker recebe o arquivo (POST em `./share`), guarda num cache temporário e redireciona para `./?shared=1`, onde `src/main.js` abre o save.
- Para gerar o APK: publique o site, abra <https://www.pwabuilder.com>, informe a URL e escolha **Android**. Para o app abrir sem a barra de endereço (TWA), publique o `assetlinks.json` que o PWABuilder gerar em `public/.well-known/assetlinks.json` e faça o deploy de novo.

## Estrutura

```
src/
  parser/      leitura do save (save.js), tabela de caracteres, descrição com nomes (describe.js)
  data/        tabelas JSON (geradas) + quetzal-overrides.json (manual)
  ai/          assistente com IA (Gemini ou Groq): clientes, pedido/conferência e telas
  ui/          templates, sprites, download/cópia
  export.js    CSV / Showdown / JSON
  main.js      entrada leve (tema, abrir arquivo, service worker)
  app.js       carregado sob demanda: parser + tabelas + renderização
tools/         gerador de tabelas, diff de saves, gerador de ícones
test/          Vitest (saves sintéticos + save real opcional)
reference/     protótipo original (não entra no build)
```
