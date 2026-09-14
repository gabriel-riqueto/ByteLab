import { agruparParaExibicao } from "../group";
import { BatchSettings, ProcessedRow } from "../types";

export const AVISO_MERCADO_LIVRE =
  "Rascunho não validado pela API do Mercado Livre. Categoria, atributos obrigatórios, imagens e variações devem ser conferidos antes da publicação.";

function numero(valor: string): number {
  const resultado = Number(valor);
  return Number.isFinite(resultado) ? resultado : 0;
}

/**
 * Gera um JSON de trabalho inspirado no modelo de anúncios do Mercado Livre.
 * Ele não é enviado à plataforma e não deve ser tratado como payload aprovado.
 */
export function gerarRascunhoMercadoLivre(linhas: ProcessedRow[], config: BatchSettings): string {
  const itens = agruparParaExibicao(linhas).map(({ pai, filhos }) => {
    const imagens = [...new Set(filhos.map((filho) => filho.imagemUrl).filter(Boolean))];
    const primeiro = filhos[0];

    return {
      title: pai.nomeBase,
      category_id: config.mlCategoriaId,
      currency_id: "BRL",
      buying_mode: "buy_it_now",
      listing_type_id: config.mlTipoAnuncio,
      condition: config.mlCondicao,
      price: primeiro ? numero(primeiro.preco) : 0,
      available_quantity: filhos.reduce((total, filho) => total + numero(filho.quantidade), 0),
      pictures: imagens.map((source) => ({ source })),
      attributes: [{ id: "BRAND", value_name: config.marca }],
      variations: filhos.map((filho) => ({
        seller_custom_field: filho.sku,
        price: numero(filho.preco),
        available_quantity: numero(filho.quantidade),
        attribute_combinations: [
          { id: "COLOR", value_name: filho.cor },
          { id: "SIZE", value_name: filho.tamanho },
        ],
        attributes: filho.gtin ? [{ id: "GTIN", value_name: filho.gtin }] : [],
      })),
    };
  });

  return JSON.stringify(
    {
      generated_by: "ByteLab",
      status: "draft_not_validated",
      platform: "mercado_livre",
      site_id: "MLB",
      disclaimer: AVISO_MERCADO_LIVRE,
      generated_at: new Date().toISOString(),
      items: itens,
    },
    null,
    2
  );
}
