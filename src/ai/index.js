// Funções de IA (carregadas sob demanda, só quando o usuário toca num botão do assistente).
// Em duas etapas: prepareAi monta exatamente o que vai ser enviado (para o usuário ver e confirmar);
// sendAi envia e desenha a resposta.

import { provider } from './providers.js';
import { refOf, systemPrompt, localizedSchema, ANALYSIS_SCHEMA, BUILD_SCHEMA, analysisPrompt, buildPrompt, buildPool, strategyLines, checkAnalysis, checkBuild } from './prompt.js';
import { analysisView, buildView, confirmView } from './view.js';

/**
 * Monta o pedido sem enviar nada.
 * @param {'analyze'|'build'} kind
 * @param {{ all: object[], T: object, game?: object, note?: string, dex?: object }} ctx dex = golpes por nível (dex.json), opcional
 */
export function prepareAi(kind, { all, T, game = null, note = '', dex = null }) {
  const P = provider();
  const system = systemPrompt(game);
  const prompt = kind === 'analyze' ? analysisPrompt(all, T, note, P.maxCandidates, { dex, game }) : buildPrompt(all, T, note, P.maxCandidates);
  const lines = prompt.split('\n');
  const counts = {
    party: lines.filter(l => /^E\d \|/.test(l)).length,
    pc: lines.filter(l => /^C\d+-\d+ \|/.test(l)).length,
    pcTotal: all.filter(m => m.location !== 'party').length,
    learn: lines.some(l => /^E\d: /.test(l)), // golpes por nível da equipe (análise do Quetzal/Unbound)
    hints: kind === 'build' && strategyLines(buildPool(all, P.maxCandidates)).length > 0, // clima/terreno/Trick Room
  };
  return { kind, P, system, prompt, schema: localizedSchema(kind === 'analyze' ? ANALYSIS_SCHEMA : BUILD_SCHEMA), all, T, note: note.trim(), counts };
}

/** HTML da janela de confirmação ("o que vai ser enviado"). */
export function confirmHtml(prep) {
  return confirmView(prep);
}

/** Envia o pedido preparado e devolve a tela do resultado. */
export async function sendAi(prep) {
  const { kind, P, system, prompt, schema, all, T } = prep;
  const byRef = new Map(all.map(m => [refOf(m), m]));
  const label = model => `${P.service} (${model})`;
  const { data, model } = await P.generateJSON({ system, prompt, schema });
  if (kind === 'analyze') {
    return { html: analysisView(checkAnalysis(data, byRef), byRef, label(model)), byRef, team: null };
  }
  const r = checkBuild(data, byRef);
  return { html: buildView(r, byRef, label(model), T), byRef, team: r.membros.map(x => byRef.get(x.ref)) };
}

/** Prepara e envia direto (sem confirmação). */
export async function runAi(kind, ctx) {
  return sendAi(prepareAi(kind, ctx));
}
