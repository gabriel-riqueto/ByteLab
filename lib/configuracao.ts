import { BatchSettings, InputRow } from "./types";

/** Regras da ação "Processar produtos"; o mesmo resultado define a indicação de obrigatoriedade na tela. */
export function verificarConfiguracao(entradas: InputRow[], config: BatchSettings) {
  const precisaQuantidadePadrao = entradas.some((linha) => linha.quantidade === undefined);
  const quantidadeValida = Number.isInteger(config.quantidadePadrao) && config.quantidadePadrao >= 0;
  const podeContinuar = Boolean(
    (config.plataforma === "amazon" || config.plataforma === "mercado_livre") &&
    config.marca.trim() && config.sistemaTamanho.trim() && quantidadeValida &&
    (config.plataforma === "amazon" ||
      (/^MLB\d{2,}$/.test(config.mlCategoriaId.trim()) &&
        (config.mlCondicao === "new" || config.mlCondicao === "used") && config.mlTipoAnuncio.trim()))
  );
  return { precisaQuantidadePadrao, podeContinuar };
}
