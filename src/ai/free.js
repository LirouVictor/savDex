// Modo livre do Assistente: jogos em que a habilidade pode ser trocada por item (conferido nas tabelas da ROM).
// 'patch' = Ability Capsule (1ª ↔ 2ª) e Ability Patch (oculta); 'capsule' = só a Ability Capsule.
// Fica separado (e pequeno) porque a janela do Assistente, no pacote principal, também precisa saber.

const FREE_ABILITY = { quetzal: 'patch', soulgold: 'patch', unbound: 'capsule' };
export const freeAbilityMode = game => (game && FREE_ABILITY[game.id]) || null;
