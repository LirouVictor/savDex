// Textos das janelas Privacidade, Termos de uso e Novidades (português e inglês).
// Carregado só quando uma delas é aberta. Ao mudar o que o app guarda ou envia, atualizar a Privacidade.

export const UPDATED = '2026-10-19';

/** Novidades, da mais nova para a mais antiga. A data da primeira fica também em latest.js. */
export const NEWS = [
  {
    date: '2026-10-19',
    pt: [
      'Montar equipe: a equipe escolhida fica numa barra, e o botão “Trocar equipe” abre uma janela com todas as equipes compatíveis (filtro por finais de torneio ou de exemplo, e a ordem explicada); quem ainda não foi montada é adaptada na hora. O X dos cards fica dentro do bloco colorido, a legenda dos golpes saiu (cada golpe já diz “tutor” ou “nível”) e a opção “Sem lendários e míticos” também. E uma correção: duas equipes com climas automáticos diferentes (Sand Stream e Snow Warning, por exemplo) não são mais montadas juntas, porque um clima apaga o outro (a Aurora Veil da Ninetales de Alola falhava com o Tyranitar).',
    ],
    en: [
      'Build team: the chosen team sits in a bar, and the “Change team” button opens a window with every compatible team (filter by tournament finals or samples, with the order explained); teams not built yet are adapted on the spot. The cards’ X sits inside the colored block, the move legend is gone (each move already says “tutor” or “level”) and so is the “No legendaries or mythicals” option. And a fix: two different automatic weathers (Sand Stream and Snow Warning, for example) are no longer put on the same team, since one erases the other (Alolan Ninetales’ Aurora Veil failed alongside Tyranitar).',
    ],
  },
  {
    date: '2026-10-18',
    pt: [
      'Montar equipe mais simples no celular: as equipes aparecem numa lista, uma por linha, e cada equipe mostra primeiro a original e depois a sua adaptada, com os Pokémon em blocos como na seção Equipe. Toque num Pokémon da original para ver se você tem, o que ele faz na equipe e o que o formato costuma usar com ele; toque num da sua equipe para ver golpes, item e o que ensinar. Embaixo ficam as trocas e a estratégia. Saíram o campo de pedido, os próximos passos, as contas e as interações.',
    ],
    en: [
      'Build team is simpler on phones: teams show up in a list, one per row, and each team shows the original first and then your adapted one, with the Pokémon in blocks like the Team section. Tap a Pokémon from the original to see whether you have it, what it does in the team and what the format usually runs on it; tap one from your team to see moves, item and what to teach. Swaps and the strategy come below. The request field, next steps, team math and interactions are gone.',
    ],
  },
  {
    date: '2026-10-17',
    pt: [
      'Montar equipe: agora entram também equipes de finais de torneio do Smogon (campeãs e finalistas), com o replay da final como prova. A aba diz “Campeã” ou “Finalista”, e a “Equipe original” traz o torneio, o placar da final e os links do replay e do tópico. Como o replay só mostra o que apareceu na partida, os papéis de cada Pokémon são os que ele mostrou na final.',
    ],
    en: [
      'Build team: Smogon tournament final teams (champions and finalists) now join too, with the replay of the final as proof. The tab says “Champion” or “Finalist”, and “Original team” shows the tournament, the final’s score and links to the replay and the thread. Since a replay only shows what came up in the game, each Pokémon’s roles are the ones it showed in the final.',
    ],
  },
  {
    date: '2026-10-16',
    pt: [
      'Montar equipe: a janela ficou mais simples. Saíram as opções que não fazem mais sentido com as equipes de referência (Preparo, Sem restrição de item, Ameaças do jogo) e o botão “Montar do zero”. A megapedra agora sempre conta (o app só diz qual pedra dar), e a montagem do zero só aparece quando nenhuma equipe de referência combina com o seu save, com o aviso. Também: Pokémon com Air Lock ou Cloud Nine (Rayquaza, Golduck…) não entram mais em equipes de clima, porque anulam o clima da própria equipe.',
    ],
    en: [
      'Build team: the window is simpler. The options that no longer make sense with reference teams (Preparation, No item restriction, Game threats) and the “Build from scratch” button are gone. Mega Stones now always count (the app just says which stone to give), and building from scratch only shows up when no reference team fits your save, with a notice. Also: Pokémon with Air Lock or Cloud Nine (Rayquaza, Golduck…) no longer join weather teams, since they cancel their own team’s weather.',
    ],
  },
  {
    date: '2026-10-15',
    pt: [
      'Montar equipe (Quetzal), equipes de referência: os Pokémon que ficam da equipe original agora mantêm o papel que tinham nela quando conseguem (Corviknight volta a tirar hazards com Defog, o pivô volta a ter U-turn), se a equipe inteira rende mais assim. Nos saves de teste, os Pokémon mantidos passaram a cumprir 86% dos papéis da original (antes, 68%). A tela diz o papel que cada um manteve e com que golpe, ou por que perdeu: a equipe rende mais sem ele ou ele não aprende o golpe no jogo.',
    ],
    en: [
      'Build team (Quetzal), reference teams: the Pokémon kept from the original team now keep the role they had there when they can (Corviknight clears hazards with Defog again, the pivot gets U-turn back), if the whole team scores higher that way. In the test saves, kept Pokémon now fill 86% of their original roles (68% before). The screen says which role each one kept and with which move, or why it lost it: the team scores higher without it, or it cannot learn the move in the game.',
    ],
  },
  {
    date: '2026-10-14',
    pt: [
      'Montar equipe (Quetzal): agora o ponto de partida são equipes de verdade do competitivo. O app compara 64 equipes de exemplo do Smogon (Gen 9: National Dex, Ubers, OU, UU, RU, NU e PU, reunidas pelo projeto pkmn/smogon) com o seu save, mantém os Pokémon que você tem e troca os que faltam por Pokémon seus, escolhidos juntos pela equipe inteira e tentando preservar o plano, as estratégias e os papéis da original. Cada equipe mostra a original (com o link do tópico do Smogon e o que foi conferido), a sua versão adaptada (quem ficou, quem entrou no lugar de quem e o que se perdeu) e o que falta para reproduzir a original. Equipes de exemplo não são campeãs de torneio, e a tela diz isso. Se nenhuma equipe combina com o seu save, o app avisa; a montagem do zero continua no botão “Montar do zero”.',
    ],
    en: [
      'Build team (Quetzal): the starting point is now real competitive teams. The app compares 64 Smogon sample teams (Gen 9: National Dex, Ubers, OU, UU, RU, NU and PU, collected by the pkmn/smogon project) with your save, keeps the Pokémon you have and replaces the missing ones with your own, chosen together for the whole team while trying to preserve the original plan, strategies and roles. Each team shows the original (with the link to the Smogon thread and what was checked), your adapted version (who stayed, who replaced whom and what was lost) and what is missing to rebuild the original. Sample teams are not tournament winners, and the screen says so. If no team fits your save, the app tells you; building from scratch is still available with “Build from scratch”.',
    ],
  },
  {
    date: '2026-10-13',
    pt: [
      'Comentar com IA (Quetzal): a IA agora propõe até 3 estratégias para a equipe, as conhecidas do competitivo e ideias novas, explicando como executar e o que cada Pokémon precisa ter. O app confere cada golpe, item e habilidade antes de mostrar: marca o que é conhecido e conferido, o que é ideia nova (ainda não comprovada) e o que a IA errou, como um golpe que o Pokémon não aprende.',
      'Montar equipe (Quetzal): as estratégias conhecidas do competitivo (pivôs, hazards com quem os tira, telas para quem sobe os stats, Belly Drum com prioridade, núcleos Fire/Water/Grass e Dragon/Steel/Fairy…) e as combinações de habilidade, item e golpes (Toxic Orb + Poison Heal, Flame Orb + Guts…) agora contam na nota. Só a estratégia completa conta, e a montagem também parte de quem executa cada uma e procura no seu PC quem falta. No save do autor, a chuva passou a Pelipper, Basculegion e Rillaboom com pivôs.',
    ],
    en: [
      'Comment with AI (Quetzal): the AI now proposes up to 3 strategies for the team, known competitive ones and new ideas, explaining how to execute them and what each Pokémon needs. The app checks every move, item and ability before showing them: it marks what is known and checked, what is a new idea (not proven yet) and what the AI got wrong, such as a move the Pokémon does not learn.',
      'Build team (Quetzal): known competitive strategies (pivots, hazards with removal, screens for setup sweepers, Belly Drum with priority, Fire/Water/Grass and Dragon/Steel/Fairy cores…) and ability, item and move combinations (Toxic Orb + Poison Heal, Flame Orb + Guts…) now count in the score. Only complete strategies count, and the builder also starts from whoever runs each one and looks in your PC for whoever is missing. On the author’s save, the rain team became Pelipper, Basculegion and Rillaboom with pivots.',
    ],
  },
  {
    date: '2026-10-12',
    pt: [
      'Montar equipe (Quetzal): novo painel “Estratégias da equipe”. Explica como jogar o plano (chuva, sol, Trick Room, Hiperofensiva…) e o que o quebra, e mostra as estratégias conhecidas do competitivo que a equipe executa com os golpes e itens sugeridos: pivôs com U-turn e Volt Switch, hazards com quem os tira, telas para quem sobe os stats, Belly Drum com prioridade, núcleos Fire/Water/Grass e Dragon/Steel/Fairy e outras. Quando falta pouco, diz o que ensinar ou que item dar.',
      'Montar equipe (Quetzal): o app reconhece combinações de habilidade, item e golpes, como Toxic Orb + Poison Heal, Flame Orb + Guts, Life Orb + Magic Guard e Focus Sash + Reversal. O card mostra a combinação e a parte “Interações” explica o que acontece na batalha. O item sugerido também precisa funcionar com os golpes e a habilidade: nada de Electric Seed sem Electric Terrain ou Flame Orb num Pokémon de Fire.',
      'Montar equipe (Quetzal): cada Pokémon agora vem com o item e a habilidade que o competitivo (Smogon) mais usa. A habilidade entra nas contas da equipe (Ninetales de Alola com Snow Warning abre um time de neve) e a tela diz para trocar com Ability Capsule ou Ability Patch; o item aparece no card (“dar” quando ele ainda não segura) e nos próximos passos, combinando com os golpes (nada de Choice Band num set com Swords Dance). Quem põe o clima do plano leva a pedra do clima. O Copiar (Showdown) já sai com item e habilidade.',
      'Montar equipe (Quetzal): o app agora escolhe os 4 golpes de cada Pokémon da equipe, entre os que ele já sabe, os que aprende por nível e os do tutor. No Quetzal, o menu do Pokémon (NOVO MOV.) ensina na hora e de graça qualquer golpe do tutor e os por nível até o nível atual, então o app monta o moveset pelo competitivo: os golpes que os sets do Smogon daquela espécie mais usam (se ela aprende no jogo), completados por contas (golpes do próprio tipo, cobertura, setup, recuperação, hazards, pivô) para quem não tem dados. Cada card mostra os 4 golpes (com a marca “tutor”, “nível” ou o nível em que aprende), os próximos passos dizem o que ensinar, e o “Copiar (Showdown)” e o “Comentar com IA” levam esse moveset. Em batalhas simuladas, as equipes com o moveset venceram as de antes do mesmo plano em 84% dos jogos.',
      'Montar equipe (Quetzal): o moveset muda com o plano. Na chuva, Thunder e Hurricane (que não erram) e Weather Ball de Water; no sol, Solar Beam sem carregar; na neve, Blizzard e Aurora Veil (que só funciona lá); nos terrenos, Rising Voltage, Expanding Force e Grassy Glide; no Trick Room, nada de subir a velocidade; na Hiperofensiva, mais setup e hazards. E a equipe é montada já contando com isso.',
    ],
    en: [
      'Build team (Quetzal): new “Team strategies” panel. It explains how to play the plan (rain, sun, Trick Room, Hyper Offense…) and what breaks it, and shows the known competitive strategies the team runs with the suggested moves and items: U-turn and Volt Switch pivots, hazards with removal, screens for setup sweepers, Belly Drum with priority, Fire/Water/Grass and Dragon/Steel/Fairy cores and more. When little is missing, it says what to teach or which item to give.',
      'Build team (Quetzal): the app recognizes ability, item and move combinations, such as Toxic Orb + Poison Heal, Flame Orb + Guts, Life Orb + Magic Guard and Focus Sash + Reversal. The card shows the combination and the “Interactions” section explains what happens in battle. The suggested item also has to work with the moves and ability: no Electric Seed without Electric Terrain, no Flame Orb on a Fire Pokémon.',
      'Build team (Quetzal): each Pokémon now comes with the item and ability competitive play (Smogon) uses most. The ability counts in the team’s calculations (Alolan Ninetales with Snow Warning opens a snow team) and the screen says to change it with an Ability Capsule or Ability Patch; the item shows on the card (“give” when it is not holding it yet) and in the next steps, matching the moves (no Choice Band on a Swords Dance set). Whoever sets the plan’s weather gets the weather rock. Copy (Showdown) already includes item and ability.',
      'Build team (Quetzal): the app now picks the 4 moves of each team member, from the ones it already knows, the ones it learns by level and the tutor ones. In Quetzal, the Pokémon menu (NEW MOVE) teaches any tutor move and the level moves up to the current level right away and for free, so the app builds the moveset from competitive play: the moves Smogon sets of that species use most (if it learns them in the game), filled in by calculations (same-type moves, coverage, setup, recovery, hazards, pivoting) for those without data. Each card shows the 4 moves (marked “tutor”, “level” or the level it learns them at), the next steps say what to teach, and “Copy (Showdown)” and “Comment with AI” take that moveset along. In simulated battles, teams with the moveset beat the previous ones of the same plan in 84% of the games.',
      'Build team (Quetzal): the moveset changes with the plan. In rain, Thunder and Hurricane (which never miss) and Water Weather Ball; in sun, Solar Beam without charging; in snow, Blizzard and Aurora Veil (which only works there); on terrains, Rising Voltage, Expanding Force and Grassy Glide; in Trick Room, no speed boosts; in Hyper Offense, more setup and hazards. And the team is built already counting on it.',
    ],
  },
  {
    date: '2026-10-11',
    pt: [
      'Detalhe do Pokémon (Quetzal): duas listas novas, tiradas da ROM do jogo. “Golpes por tutor” mostra tudo o que o menu NOVO MOV. → TUTOR do jogo ensina (qualquer golpe, a qualquer momento), e “Golpes de ovo”, os que passam no cruzamento.',
      'Montar equipe: nos PCs muito grandes (mais de 500 Pokémon), a busca olha o dobro de candidatos. Pokémon fortes que perdiam a vaga para os lendários agora entram, e as equipes que mudaram venceram as de antes do mesmo plano em batalhas simuladas (simulador do Pokémon Showdown). Nos PCs menores nada muda.',
      'Montar equipe: novo plano “Hiperofensiva”, o mais usado no competitivo de singles. Um Pokémon abre o caminho com hazards (Stealth Rock, Spikes…) ou telas (Reflect, Light Screen, Aurora Veil) e 3 ou mais atacantes fortes sobem os stats (Swords Dance, Dragon Dance, Nasty Plot…) e varrem. Aparece quando o save tem quem faça isso (também ensinando golpes que eles aprendem por nível), e a tela diz o que ensinar.',
      'Montar equipe mais objetiva: cada Pokémon mostra a função e até 3 motivos curtos (ex.: “Drizzle · pivô, recuperação”), os pontos fortes e fracos ficam nos 3 mais importantes, os próximos passos vêm logo depois, o ideal do competitivo e as ameaças cabem numa linha por item, e as contas detalhadas ficam recolhidas em “Contas da equipe”. A nota mostra só as partes que não são zero.',
      'Montar equipe: novo painel “Ideal do competitivo × o que você tem”. Para cada equipe, o app procura quem o competitivo usaria com ela e você não tem (Barraskewda com o seu Pelipper, por exemplo), diz em qual vaga ele entraria e quanto a nota subiria, e mostra o mais parecido que você já tem no save, com a nota que a equipe fica com ele. Lendários e míticos ficam de fora, e o painel avisa que é uma estimativa. O “Comentar com IA” leva essas linhas, e a IA diz se vale capturar o ideal ou usar a alternativa.',
      'Montar equipe: a nota ganhou a parte “Competitivo”, feita com as estatísticas públicas de uso do Smogon (batalhas do Pokémon Showdown). Duplas que aparecem juntas nos times do competitivo bem mais que o acaso somam pontos (Pelipper + Basculegion, ≈9×), e as que quase nunca jogam juntas tiram. Cada jogo usa o formato da sua geração (Gen 3 OU no Emerald, Gen 8 National Dex no Unbound, Gen 9 National Dex no Quetzal…); Pokémon sem dados (sem evoluir, próprios do hack, pouco usados) contam como neutros. O peso é pequeno: fraquezas, cobertura e plano continuam mandando. Os pontos fortes e fracos de cada equipe mostram as duplas.',
      'Montar equipe: nova caixa “Considerar as ameaças do jogo” (desligada por padrão). Marcada, a nota ganha a parte “Ameaças” e a tela mostra os Pokémon fortes do jogo (do próprio jogo ou da ROM do hack): quantos a equipe acerta em cheio, quantos derruba em dois golpes e, o que mais importa, contra quantos alguém entra no campo e vence o 1 contra 1. Golpe super efetivo sozinho não conta como resposta. É uma estimativa (nível 50, sem itens nem EVs, golpes que as ameaças aprendem por nível), e o painel diz o que ela não sabe. A montagem fica mais lenta com a caixa marcada.',
      'Imagem da equipe: nomes longos (Basculegion, Corviknight) diminuem para caber, em vez de aparecer cortados. Equipes salvas: os botões ficam em grade e Apagar em vermelho. Janela de erro ao abrir o arquivo com as duas saídas na largura toda.',
      'Visual mais caprichado: as listas de seleção (como o Preparo do montador, agora com “Posso treinar” e “Prontos para usar” e a explicação embaixo) seguem o mesmo estilo em todo o app; as caixas de marcar ganharam o visual do app, com o nome da opção em destaque e o que ela faz embaixo; os botões de Exportar, da Equipe e do resultado do montador ficam alinhados em grade; os filtros da Busca viraram selos compactos; a nota do montador aparece em selos (verde soma, vermelho tira) e as abas dos planos ficam numa linha só. Sem internet, as insígnias aparecem como losangos em vez de imagens quebradas.',
      'Montar equipe e Assistente viraram uma janela só (“Montar equipe”, em Ferramentas), com um pedido para os dois. O app monta sozinho, sem IA, como antes; a IA fica em “Com IA (opcional)”, no fim da janela, e ganhou um jeito de juntar os dois métodos: “Comentar com IA”, embaixo da equipe que o app montou, manda essa equipe à IA com o plano e a função de cada membro, e ela explica como a equipe joga, aponta riscos, sugere até 2 trocas e dá dicas de golpes e itens (a equipe e a nota continuam as do app). “Analisar minha equipe” e “Montar com IA” continuam lá. No pedido, o app reconhece os Pokémon citados no meio da frase (“quero o Lucario e o Charizard; time de chuva”).',
      'Detalhe do Pokémon: a linha evolutiva virou uma árvore, com cada ramo na sua fileira e setas entre os estágios. Linhas com forma regional (Goomy → Sliggoo → Goodra e, embaixo, Sliggoo de Hisui → Goodra de Hisui) ou com vários ramos (Eevee, Wurmple) não ficam mais embaralhadas; em tela estreita, a árvore rola para o lado em vez de quebrar.',
    ],
    en: [
      'Pokémon details (Quetzal): two new lists, taken from the game ROM. “Tutor moves” shows everything the game’s NEW MOVE → TUTOR menu teaches (any move, at any time), and “Egg moves”, the ones passed on when breeding.',
      'Team builder: in very large PCs (over 500 Pokémon) the search looks at twice as many candidates. Strong Pokémon that lost their spot to legendaries now get in, and the teams that changed beat the old ones of the same plan in simulated battles (Pokémon Showdown simulator). Smaller PCs are unchanged.',
      'Build team: a new “Hyper Offense” plan, the most used in competitive singles. One Pokémon paves the way with hazards (Stealth Rock, Spikes…) or screens (Reflect, Light Screen, Aurora Veil) and 3 or more strong attackers boost their stats (Swords Dance, Dragon Dance, Nasty Plot…) and sweep. It shows up when the save has Pokémon for it (also by teaching moves they learn by level), and the screen says what to teach.',
      'A more to-the-point Build team: each Pokémon shows its role and up to 3 short reasons (e.g. “Drizzle · pivot, recovery”), strengths and weaknesses keep the 3 that matter most, next steps come right after, the competitive ideal and the threats fit in one line per item, and the detailed calculations are folded into “Team calculations”. The score shows only the parts that are not zero.',
      'Build team: a new “Competitive ideal × what you have” panel. For each team, the app looks for what competitive players would use with it that you do not have (Barraskewda with your Pelipper, for example), says which slot it would take and how much the score would go up, and shows the closest Pokémon you already have in the save, with the team’s score with it. Legendaries and mythicals are left out, and the panel says it is an estimate. “Comment with AI” takes these lines along, and the AI says whether it is worth catching the ideal or using the alternative.',
      'Build team: the score has a new “Competitive” part, based on Smogon’s public usage statistics (Pokémon Showdown battles). Pairs that appear together on competitive teams far more than chance add points (Pelipper + Basculegion, ≈9×), and pairs that almost never play together subtract. Each game uses the format of its generation (Gen 3 OU for Emerald, Gen 8 National Dex for Unbound, Gen 9 National Dex for Quetzal…); Pokémon without data (unevolved, hack-only, rarely used) count as neutral. The weight is small: weaknesses, coverage and the plan still lead. Each team’s strengths and weaknesses list the pairs.',
      'Build team: a new “Consider the game’s threats” box (off by default). When checked, the score gets a “Threats” part and the screen shows the strong Pokémon in the game (from the game itself or the hack’s ROM): how many the team hits super effectively, how many it takes down in two hits and, most importantly, how many someone can switch into and beat one-on-one. A super effective move alone does not count as an answer. It is an estimate (level 50, no items or EVs, moves the threats learn by level), and the panel says what it does not know. Building takes longer with the box checked.',
      'Team image: long names (Basculegion, Corviknight) shrink to fit instead of being cut off. Saved teams: the buttons line up in a grid and Delete is red. The error window when opening a file shows both options at full width.',
      'A more polished look: dropdowns (like the builder’s Preparation, now “I can train” and “Ready to use” with the explanation below) share the same style across the app; checkboxes got the app’s look, with the option name highlighted and what it does below; the Export, Party and builder result buttons line up in a grid; the Search filters became compact chips; the builder score shows as chips (green adds, red subtracts) and the plan tabs stay on one line. Offline, badges show as diamonds instead of broken images.',
      'Build team and Assistant are now a single window (“Build a team”, in Tools), with one request for both. The app builds on its own, without AI, as before; the AI is under “With AI (optional)”, at the end of the window, and gained a way to combine both methods: “Comment with AI”, below the team the app built, sends that team to the AI with the plan and each member’s role, and it explains how the team plays, points out risks, suggests up to 2 swaps and gives move and item tips (the team and the score stay the app’s). “Rate my party” and “Build with AI” are still there. In the request, the app recognizes Pokémon named in the middle of a sentence (“I want Lucario and Charizard; rain team”).',
      'Pokémon details: the evolution line is now a tree, with each branch on its own row and arrows between stages. Lines with a regional form (Goomy → Sliggoo → Goodra and, below, Hisuian Sliggoo → Hisuian Goodra) or several branches (Eevee, Wurmple) are no longer jumbled; on a narrow screen the tree scrolls sideways instead of wrapping.',
    ],
  },
  {
    date: '2026-10-10',
    pt: [
      'Novo em Ferramentas: “Montar equipe”, sem IA. O próprio app procura em todos os seus Pokémon (equipe e PC) a melhor equipe para cada plano que o save comporta (sol, chuva, areia, neve, terreno, Trick Room ou equilibrada) e mostra a nota de cada uma, de onde ela vem e a função de cada membro. Conta habilidades que anulam tipos (Lightning Rod…), quem ainda não evoluiu pela forma evoluída, quem segura a megapedra pelos tipos e pela habilidade da mega (Quetzal, Unbound e SoulGold) e os golpes que cada um aprende por nível (ex.: quem aprende Trick Room abre o plano de Trick Room, e a tela diz o que ensinar). Aceita até duas megapedras. Funciona sem chave, sem internet e sem cota; dá para pedir Pokémon que você quer na equipe.',
      'Montar equipe: nova opção “Sem lendários e míticos” (Mewtwo, Kyogre, Calyrex…), para montar com o resto do PC. Quem você pedir no campo de cima entra mesmo sendo lendário.',
      'Montar equipe: golpes fracos do começo do jogo (Tackle, Ember, Quick Attack…) não contam mais como cobertura nem como prioridade. Antes, um Goomy ou um Dreepy de nível baixo entrava contando com a forma evoluída mesmo sem golpes para batalhar. Agora contam golpes de poder 70 ou mais, os que batem mais do que o número diz (Acrobatics, Knock Off…) e os de prioridade do próprio tipo. Agility não é mais sugerido para quem não ataca forte.',
      'Montar equipe: a habilidade agora conta junto com os golpes. Technician fortalece golpes fracos (Bullet Punch no Scizor), assim como Iron Fist, Strong Jaw, Mega Launcher, Sharpness, Aerilate e outras; com Contrary, Close Combat e Leaf Storm viram setup. Quem segura a megapedra conta também a habilidade de antes de megaevoluir (Lightning Rod no Raichu, Intimidate no Staraptor). Nova opção “Sem restrição de item”, no Quetzal, no Unbound e no SoulGold: conta com a megapedra de quem tem mega, mesmo que ele ainda não a segure (Mega Staraptor), e diz qual pedra dar.',
      'Montar equipe: nova escolha de preparo. “Posso treinar” conta o que dá para conseguir evoluindo e ensinando golpes (como antes); “Prontos para usar” prefere quem já está pronto: evoluir, ensinar golpes e os níveis que faltam pesam mais, sem tirar quem ainda compensa. A nota mostra essa parte à parte (“Preparo”).',
      'Montar equipe: até 3 opções por plano (toque em "Ver outras opções deste plano"), com no máximo 3 Pokémon em comum e nota perto da melhor. Elas só são calculadas quando você pede, e as equipes principais aparecem mais rápido.',
      'Montar equipe: um plano só aparece com sinergia de verdade. Rain Dance ou Sunny Day com golpes do tipo não bastam; precisa de quem aproveita pela habilidade (Swift Swim, Chlorophyll…), pela megapedra ou por golpe próprio (Thunder, Solar Beam…); golpes do tipo com STAB contam quando o clima vem sem gastar turno (Drizzle, Drought). Trick Room precisa de quem põe e mais 3 lentos que atacam.',
      'Montar equipe: com duas megapedras, a nota conta que só uma megaevolui por batalha (antes, contava as duas juntas). O Raichu com Raichunite Y volta a segurar golpes Electric com Lightning Rod quando quem megaevolui é a outra.',
      'Montar equipe: as partes da nota (Defesa, Ataque, Plano…) agora somam a nota mostrada. Nos planos de sol com quem é fraco ao Fire, como o Venusaur, elas somavam 4 ou 8 a mais; as equipes e as notas não mudam.',
      'Montar equipe: quem tem menos de 2 golpes de dano completa com os que aprende por nível (os do próprio tipo primeiro, como o Brave Bird do Staraptor), e a tela diz o que ensinar e em que nível. Pedindo um Pokémon com a opção “Sem restrição de item”, entra a versão que rende mais (com ou sem a megapedra).',
      'Assistente: equipes com até duas megapedras (só uma megaevolui por batalha; a outra fica para outra batalha).',
      'Insígnias com as próprias imagens no card do treinador (as que faltam aparecem apagadas), no Quetzal, no SoulGold, na Gen 3 oficial e em Diamond/Pearl, Platinum e HG/SS. No Unbound e em Black/White continuam os pinos.',
      'Quetzal: corrigida a contagem de insígnias, que podia mostrar uma a mais (7 num save com 6). Agora é a mesma da tela do jogo, conferida no emulador com vários saves.',
      'O ícone da Pokédex voltou a aparecer no card do treinador.',
      'Assistente (Gemini): quando a cota grátis do dia acaba, o app passa sozinho para um modelo Lite, que tem cota própria, e avisa na resposta. Antes, ele só pedia para esperar um minuto.',
      'Assistente: em times de clima, golpes Fire contam como quem aproveita o sol (e Water, a chuva); a fraqueza a Water num time de sol (ou a Fire num de chuva) não conta mais como problema, porque o clima corta pela metade; o ajuste do app não coloca quem atrapalha o clima e, no Quetzal, no Unbound e no SoulGold, conta com a forma evoluída de quem ainda não evoluiu, avisando “evolua”; e, com duas megapedras, o app diz para megaevoluir a que põe o clima.',
      'Assistente: a montagem de equipe agora parte de um plano (clima ou terreno, Trick Room, ofensivo com setup ou equilibrado) e dá uma função a cada membro. O app calcula os papéis de cada Pokémon (pivô, setup, prioridade, tanque…), quem põe e quem aproveita cada clima (inclusive pela megapedra, como o Mega Charizard Y), quem o clima protege e avisa quando algo atrapalha (ex.: um membro fraco a Fire num time de sol). No Quetzal, as dicas podem sugerir o tipo Tera.',
    ],
    en: [
      'New in Tools: “Build team”, without AI. The app itself searches all your Pokémon (party and PC) for the best team for each plan the save supports (sun, rain, sand, snow, terrain, Trick Room or balanced) and shows each team’s score, where it comes from and each member’s function. It counts abilities that nullify types (Lightning Rod…), unevolved Pokémon by their evolved form, Mega Stone holders by the Mega’s types and ability (Quetzal, Unbound and SoulGold) and the moves each one learns by level (e.g. a Pokémon that learns Trick Room opens the Trick Room plan, and the screen says what to teach). Allows up to two Mega Stones. Works with no key, no internet and no quota; you can ask for Pokémon you want on the team.',
      'Build team: new “No legendaries or mythicals” option (Mewtwo, Kyogre, Calyrex…), to build with the rest of the PC. Pokémon you ask for in the field above still join even if legendary.',
      'Build team: weak early-game moves (Tackle, Ember, Quick Attack…) no longer count as coverage or priority. Before, a low-level Goomy or Dreepy joined on its evolved form even without moves to battle with. Now only moves with 70+ power, moves stronger than their number (Acrobatics, Knock Off…) and same-type priority moves count. Agility is no longer suggested for Pokémon that don’t hit hard.',
      'Build team: abilities now count together with moves. Technician powers up weak moves (Bullet Punch on Scizor), as do Iron Fist, Strong Jaw, Mega Launcher, Sharpness, Aerilate and others; with Contrary, Close Combat and Leaf Storm become setup. Mega Stone holders also count their ability before Mega Evolving (Lightning Rod on Raichu, Intimidate on Staraptor). New “No item restriction” option in Quetzal, Unbound and SoulGold: counts the Mega Stone of any Pokémon that has a Mega, even if it isn’t holding it yet (Mega Staraptor), and says which stone to give.',
      'Build team: new preparation choice. “I can train” counts what you can get by evolving and teaching moves (as before); “Ready to use” prefers Pokémon that are already ready: evolving, teaching moves and missing levels weigh more, without dropping those still worth it. The score shows this as its own part (“Preparation”).',
      'Build team: up to 3 options per plan (tap "See other options for this plan"), sharing at most 3 Pokémon and scoring close to the best. They are only computed when you ask, so the main teams show up faster.',
      'Build team: a plan only shows up with real synergy. Rain Dance or Sunny Day plus moves of the type are not enough; it needs Pokémon that benefit through their ability (Swift Swim, Chlorophyll…), Mega Stone or signature move (Thunder, Solar Beam…); same-type moves count when the weather comes without spending a turn (Drizzle, Drought). Trick Room needs the setter plus 3 slow attackers.',
      'Build team: with two Mega Stones, the score counts that only one Mega Evolves per battle (before, it counted both at once). Raichu holding Raichunite Y once again absorbs Electric moves with Lightning Rod when the other one Mega Evolves.',
      'Build team: the score parts (Defense, Attack, Plan…) now add up to the score shown. In sun plans with a Fire-weak member, like Venusaur, they added up to 4 or 8 more; teams and scores are unchanged.',
      'Build team: Pokémon with fewer than 2 attacking moves are completed with moves they learn by level (same type first, like Staraptor’s Brave Bird), and the screen says what to teach and at which level. When you ask for a Pokémon with “No item restriction”, the version that does best joins (with or without the Mega Stone).',
      'Assistant: teams with up to two Mega Stones (only one Mega Evolves per battle; the other is for another battle).',
      'Badges with their own images on the trainer card (missing ones are faded), in Quetzal, SoulGold, official Gen 3 and Diamond/Pearl, Platinum and HG/SS. Unbound and Black/White keep the pins.',
      'Quetzal: fixed the badge count, which could show one too many (7 on a save with 6). It now matches the game’s screen, checked in the emulator with several saves.',
      'The Pokédex icon shows on the trainer card again.',
      'Assistant (Gemini): when the daily free quota runs out, the app switches on its own to a Lite model, which has its own quota, and says so in the answer. Before, it only asked you to wait a minute.',
      'Assistant: on weather teams, Fire moves count as benefiting from sun (and Water moves from rain); a Water weakness on a sun team (or Fire on a rain team) no longer counts as a problem, since the weather halves it; the app’s adjustment no longer brings in members that hurt the weather and, in Quetzal, Unbound and SoulGold, counts the evolved form of members that haven’t evolved yet, with an “evolve” note; and with two Mega Stones, the app says to Mega Evolve the one that sets the weather.',
      'Assistant: team building now starts from a plan (weather or terrain, Trick Room, setup offense or balance) and gives each member a function. The app works out each Pokémon’s roles (pivot, setup, priority, tank…), who sets and who abuses each weather (Mega Stones included, like Mega Charizard Y), who the weather protects, and warns when something gets in the way (e.g. a Fire-weak member on a sun team). In Quetzal, the tips can suggest a Tera type.',
    ],
  },
  {
    date: '2026-10-09',
    pt: [
      'Assistente: “Modo livre” no Quetzal, no SoulGold (Ability Capsule e Ability Patch) e no Unbound (Ability Capsule). Ligado, a IA pode contar com as outras habilidades de cada Pokémon (ex.: um Torkoal que vira Drought) e diz nas dicas qual habilidade usar e com qual item.',
      'Assistente: quando a equipe montada pela IA tem um tipo que acerta 3 ou mais membros em cheio, o próprio app troca até 2 membros por Pokémon seus que resistem a ele, mexendo o mínimo (sem tirar quem você pediu nem quem sustenta o clima da equipe), e mostra a troca. A IA também só monta equipe de clima, terreno ou Trick Room se algum Pokémon disponível realmente o põe (pela habilidade que ele tem, não pela que a espécie costuma ter). Corrigido o nome da equipe sugerida, que aparecia espremido no celular.',
      'Equipes salvas: guarde a equipe atual (botão “Salvar equipe” na seção Equipe) ou uma montada pela IA. Elas ficam em Ferramentas → Equipes salvas, só neste aparelho e só para o save delas, e mostram onde cada membro está agora quando você abre uma versão mais nova do save (na equipe, em qual caixa, se evoluiu ou se não está mais lá), com fraquezas, cobertura, cópia para o Showdown e imagem.',
      'Assistente: na montagem de equipe, a IA segue uma ordem de prioridades (estratégia em conjunto, poucas fraquezas em comum, cobertura, equilíbrio; stats base só para desempatar) e, quando o PC não cabe inteiro no pedido (no Groq, por exemplo), entram primeiro quem põe ou aproveita clima, terreno e Trick Room e os melhores de cada tipo, não só os de stats base mais altos.',
    ],
    en: [
      'Assistant: “Free mode” in Quetzal, SoulGold (Ability Capsule and Ability Patch) and Unbound (Ability Capsule). When on, the AI can count on each Pokémon’s other abilities (e.g. a Torkoal that becomes Drought) and says in the tips which ability to use and with which item.',
      'Assistant: when the team built by the AI has a type that hits 3 or more members super effectively, the app itself swaps up to 2 members for Pokémon of yours that resist it, changing as little as possible (never removing the ones you asked for or the ones holding up the team’s weather), and shows the swap. The AI also only builds a weather, terrain or Trick Room team if an available Pokémon really sets it (by the ability it has, not the one the species usually has). Fixed the suggested team’s name, which showed up squeezed on phones.',
      'Saved teams: keep the current party (“Save team” button in the Party section) or one built by the AI. They live in Tools → Saved teams, on this device only and only for their own save, and show where each member is now when you open a newer version of the save (in the party, in which box, whether it evolved or is no longer there), with weaknesses, coverage, a Showdown copy and an image.',
      'Assistant: when building a team, the AI follows an order of priorities (a strategy that works together, few shared weaknesses, coverage, balance; base stats only as a tiebreaker) and, when the PC does not fit whole in the request (on Groq, for example), those who set or benefit from weather, terrain and Trick Room and the best of each type go in first, not just the ones with the highest base stats.',
    ],
  },
  {
    date: '2026-10-08',
    pt: [
      'Quetzal: lê também o PC compacto de 67 caixas (sem apelidos, HP e PP), que antes aparecia com Pokémon e dados sem sentido, e a Pokédex e as insígnias de quem está jogando em Johto ou Kanto, conferidas no próprio jogo.',
      'Pokédex: no card do treinador, “Ver o que falta” mostra as espécies que faltam capturar, por geração, marcando as que dá para conseguir evoluindo um Pokémon que você já tem (equipe ou PC) e, no Unbound e no SoulGold, as que você já viu.',
      'Quetzal: corrigido o PC que aparecia com Pokémon e dados sem sentido (espécies estranhas, “Golpe 1022”, “Item 964”) no Quetzal em inglês, que guarda o PC num formato menor (sem HP nem PP) e tem 45 caixas. Também corrigida a leitura das caixas além das primeiras em qualquer save do Quetzal com o PC mais cheio.',
      'Contagem de visitas com o Cloudflare Web Analytics, sem cookies e sem nada do seu save: só a página aberta, de onde veio, navegador, aparelho e país. Detalhes na Privacidade.',
      'Ruby/Sapphire conferidos com saves reais: o resumo (tempo de jogo, dinheiro, insígnias e Pokédex) deixou de ser “provável”. Corrigido também um save de Ruby/Sapphire que aparecia como Emerald, com o dinheiro errado.',
    ],
    en: [
      'Quetzal: also reads the compact 67-box PC (no nicknames, HP or PP), which used to show nonsense Pokémon and data, and the Pokédex and badges of players in Johto or Kanto, checked against the game itself.',
      'Pokédex: on the trainer card, “See what’s missing” lists the species you still need to catch, by generation, marking the ones you can get by evolving a Pokémon you already have (party or PC) and, in Unbound and SoulGold, the ones you have already seen.',
      'Quetzal: fixed the PC showing nonsense Pokémon and data (odd species, “Move 1022”, “Item 964”) in the English Quetzal, which stores the PC in a smaller format (no HP or PP) and has 45 boxes. Also fixed reading boxes past the first ones in any Quetzal save with a fuller PC.',
      'Visit counting with Cloudflare Web Analytics, with no cookies and nothing from your save: only the page opened, where you came from, browser, device and country. Details in Privacy.',
      'Ruby/Sapphire checked against real saves: the summary (play time, money, badges and Pokédex) is no longer “probable”. Also fixed a Ruby/Sapphire save that showed up as Emerald, with the wrong money.',
    ],
  },
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
  <li><b>Equipes salvas</b>: quando você toca em <b>Salvar equipe</b>, os dados dos Pokémon dessa equipe (espécie, golpes, item, natureza, IVs, onde estavam) ficam guardados neste navegador (até 20 por save), para o app mostrar onde cada um está nas próximas versões do save. O botão <b>Apagar</b> de cada equipe, em Ferramentas → Equipes salvas, apaga a equipe.</li>
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
  <li><b>Sprites</b>: as imagens dos Pokémon e das insígnias vêm do repositório PokeAPI/sprites, no GitHub (raw.githubusercontent.com), que recebe esses pedidos de imagem.</li>
  <li><b>Assistente (IA), opcional</b>: só quando você toca em <b>Analisar minha equipe</b>, <b>Montar com IA</b> ou <b>Comentar com IA</b> (na equipe montada pelo app), o navegador envia direto ao serviço escolhido (Google Gemini ou Groq), com a <b>sua</b> chave, a lista dos seus Pokémon (espécie, apelido, tipos, habilidade, item, natureza, stats base, IVs e golpes), cálculos do app sobre a equipe (fraquezas, cobertura, velocidade base; no comentário, também o plano, a função de cada membro e o ideal do competitivo que falta no save, com a alternativa do save), no Quetzal e no Unbound a lista pública dos golpes que cada membro aprende por nível, e o seu pedido, se houver. <b>Montar com IA</b> faz dois envios: o primeiro escolhe os 6; o segundo, menor, leva só essa equipe e as contas do app sobre ela, para os pontos fracos e as dicas. Não vão: o arquivo .sav, seu nome de treinador, ID e SID, o nome do arquivo, nível, EVs nem PID. Antes de enviar, o app mostra o texto exato do primeiro envio; o do segundo aparece junto com o resultado. O uso desses dados segue a política do serviço escolhido; no plano grátis, o Google pode usar o que recebe para melhorar os produtos dele.</li>
</ul>
<h3>Contagem de visitas</h3>
<p>O savDex usa o <b>Cloudflare Web Analytics</b> para saber quantas pessoas usam o site. Um script pequeno do Cloudflare (static.cloudflareinsights.com) envia, a cada página aberta, o endereço da página, o site de onde você veio, o navegador, o sistema, o tipo de aparelho e o tempo de carregamento. O país é tirado do endereço IP, que não é guardado. <b>Não usa cookies</b>, não guarda nada no aparelho, não segue você entre sites e <b>nada do seu save</b> (nem o nome do arquivo) vai junto. Bloqueadores de anúncios costumam barrar esse script; o app funciona igual.</p>`,
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
  <li><b>Saved teams</b>: when you tap <b>Save team</b>, the data of that team’s Pokémon (species, moves, item, nature, IVs, where they were) is kept in this browser (up to 20 per save), so the app can show where each one is in later versions of the save. The <b>Delete</b> button of each team, in Tools → Saved teams, deletes it.</li>
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
  <li><b>Sprites</b>: Pokémon and badge images come from the PokeAPI/sprites repository on GitHub (raw.githubusercontent.com), which receives those image requests.</li>
  <li><b>Assistant (AI), optional</b>: only when you tap <b>Rate my party</b>, <b>Build with AI</b> or <b>Comment with AI</b> (on the team the app built), the browser sends directly to the chosen service (Google Gemini or Groq), with <b>your</b> key, the list of your Pokémon (species, nickname, types, ability, item, nature, base stats, IVs and moves), the app’s calculations about the team (weaknesses, coverage, base Speed; for the comment, also the plan, each member’s role and the competitive ideal missing from the save, with the alternative from the save), in Quetzal and Unbound the public list of moves each member learns by level, and your request, if any. <b>Build with AI</b> sends two requests: the first picks the 6; the second, smaller, carries only that team and the app’s calculations about it, for the weaknesses and tips. Not sent: the .sav file, your trainer name, ID and SID, the file name, level, EVs or PID. Before sending, the app shows the exact text of the first request; the second one is shown with the result. That data is handled under the chosen service’s policy; on the free tier, Google may use what it receives to improve its products.</li>
</ul>
<h3>Visit counting</h3>
<p>savDex uses <b>Cloudflare Web Analytics</b> to know how many people use the site. A small Cloudflare script (static.cloudflareinsights.com) sends, for each page opened, the page address, the site you came from, the browser, the operating system, the device type and the load time. The country is derived from the IP address, which is not stored. It <b>uses no cookies</b>, stores nothing on your device, does not track you across sites and <b>nothing from your save</b> (not even the file name) goes with it. Ad blockers often block this script; the app works the same.</p>`,
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
  <li>A parte “Competitivo” do montador de equipes usa números tirados das estatísticas públicas de uso do Smogon (batalhas do Pokémon Showdown), sem vínculo com eles. Ela diz o que os jogadores do competitivo costumam usar junto, não o que vence no seu jogo.</li>
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
  <li>The team builder’s “Competitive” part uses numbers derived from Smogon’s public usage statistics (Pokémon Showdown battles), with no affiliation. It shows what competitive players usually use together, not what wins in your game.</li>
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
