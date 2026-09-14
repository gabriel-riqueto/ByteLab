import Papa from "papaparse";
import { chave } from "./dictionaries";
import { InputRow, OUTPUT_COLUMNS, ProcessedRow } from "./types";

const CAMPOS_OBRIGATORIOS = ["sku", "nome", "preco", "cor", "tamanho"] as const;

export class ErroCodificacaoCsv extends Error {
  constructor() {
    super("O arquivo contém bytes inválidos para UTF-8. Verifique a codificação original e exporte novamente como CSV UTF-8.");
    this.name = "ErroCodificacaoCsv";
  }
}

/** Decodificação estrita: acentos e até o caractere literal � são válidos; somente bytes inválidos falham. */
export function decodificarCsvUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ErroCodificacaoCsv();
  }
}

function chaveColuna(valor: string): string {
  return chave(valor.replace(/[_\-./]+/g, " ").replace(/\s+/g, " "));
}

const ALIASES: Record<keyof Omit<InputRow, "linha">, string[]> = {
  sku: ["sku", "seller sku", "seller_sku", "codigo", "codigo do produto", "codigo interno", "referencia", "ref"],
  nome: ["nome", "nome do produto", "produto", "titulo", "titulo do produto", "descricao", "descricao do produto", "item name", "item_name"],
  grupo: ["grupo", "modelo", "familia", "produto pai", "parent sku", "parent_sku"],
  tipoProduto: ["tipo de produto", "tipo produto", "tipo_produto", "tipo-produto", "product type", "product_type", "categoria amazon"],
  departamento: ["departamento", "department", "department name", "department_name", "publico"],
  preco: ["preco", "preco de venda", "valor", "valor de venda", "price", "standard price"],
  cor: ["cor", "cor do produto", "color", "color name", "color_name"],
  tamanho: ["tamanho", "tam", "size", "size name", "size_name", "medida"],
  imagemUrl: ["url da imagem", "imagem", "url imagem", "foto", "image url", "imagem url", "image_url", "main image url", "main_image_url", "link da imagem"],
  gtin: ["gtin", "ean", "upc", "codigo de barras", "codigo barras", "barcode"],
  quantidade: ["quantidade", "qtd", "estoque", "quantidade em estoque", "stock", "inventory", "quantity", "available quantity"],
};

export interface ResultadoParseCsv {
  linhas: InputRow[];
  colunasFaltantes: string[];
  totalLinhasBrutas: number;
  errosEstrutura: string[];
}

export function analisarCsvEntrada(texto: string): ResultadoParseCsv {
  const linhas: InputRow[] = [];
  const errosEstrutura: string[] = [];
  let cabecalhosBrutos: string[] = [];
  let colunas: Partial<Record<keyof Omit<InputRow, "linha">, number>> = {};
  let linhaFisica = 1;
  let cursorAnterior = 0;
  const chavesCampos = Object.keys(ALIASES) as (keyof Omit<InputRow, "linha">)[];

  Papa.parse<string[]>(texto, {
    header: false,
    skipEmptyLines: false,
    step(resultado) {
      const numeroLinha = linhaFisica;
      const cursorAtual = resultado.meta.cursor;
      linhaFisica += (texto.slice(cursorAnterior, cursorAtual).match(/\r\n|\n|\r/g) ?? []).length;
      cursorAnterior = cursorAtual;
      const registro = resultado.data;
      if (resultado.errors.length && errosEstrutura.length < 8) {
        errosEstrutura.push(...resultado.errors.map((item) => `Linha ${numeroLinha}: ${item.message}`).slice(0, 8 - errosEstrutura.length));
      }
      if (registro.every((valor) => !valor?.trim())) return;
      if (!cabecalhosBrutos.length) {
        cabecalhosBrutos = registro;
        const mapaCabecalhos = new Map<string, number>();
        registro.forEach((cab, indice) => {
          const normalizada = chaveColuna(cab);
          if (normalizada && !mapaCabecalhos.has(normalizada)) mapaCabecalhos.set(normalizada, indice);
        });
        for (const campo of chavesCampos) {
          for (const alias of ALIASES[campo]) {
            const indice = mapaCabecalhos.get(chaveColuna(alias));
            if (indice !== undefined) { colunas[campo] = indice; break; }
          }
        }
        return;
      }
      if (registro.length !== cabecalhosBrutos.length && errosEstrutura.length < 8) {
        errosEstrutura.push(`Linha ${numeroLinha}: quantidade de colunas diferente do cabeçalho.`);
      }
      const valor = (campo: keyof Omit<InputRow, "linha">): string =>
        colunas[campo] === undefined ? "" : (registro[colunas[campo]] ?? "").trim();
      linhas.push({
        linha: numeroLinha,
        sku: valor("sku"), nome: valor("nome"), grupo: valor("grupo"),
        tipoProduto: valor("tipoProduto"), departamento: valor("departamento"),
        preco: valor("preco"), cor: valor("cor"), tamanho: valor("tamanho"),
        imagemUrl: valor("imagemUrl"), gtin: valor("gtin"),
        quantidade: colunas.quantidade === undefined ? undefined : valor("quantidade"),
      });
    },
  });

  const rotulos: Record<string, string> = {
    sku: "SKU",
    nome: "Nome do produto",
    preco: "Preço",
    cor: "Cor",
    tamanho: "Tamanho",
  };

  const colunasFaltantes = CAMPOS_OBRIGATORIOS.filter((campo) => colunas[campo] === undefined).map((campo) => rotulos[campo]);
  if (cabecalhosBrutos.length && Object.keys(colunas).length === 0) {
    errosEstrutura.push("Nenhuma coluna de produto foi reconhecida. Informe ao menos SKU, nome, preço ou outro campo do catálogo.");
  }
  return { linhas, colunasFaltantes, totalLinhasBrutas: linhas.length, errosEstrutura };
}

export type FormatoSaida = "csv" | "tsv";

export function gerarCsvSaida(linhas: ProcessedRow[], formato: FormatoSaida = "csv"): string {
  const filhosPorPai = new Map<string, ProcessedRow[]>();
  for (const linha of linhas) {
    if (linha.tipo !== "child") continue;
    if (!filhosPorPai.has(linha.skuPai)) filhosPorPai.set(linha.skuPai, []);
    filhosPorPai.get(linha.skuPai)!.push(linha);
  }

  const pais = linhas.filter((linha) => linha.tipo === "parent");
  const skusPai = new Set(pais.map((pai) => pai.sku));
  const ordenadas: ProcessedRow[] = [];
  for (const pai of pais) ordenadas.push(pai, ...(filhosPorPai.get(pai.sku) ?? []));
  ordenadas.push(...linhas.filter((linha) => linha.tipo === "child" && !skusPai.has(linha.skuPai)));

  const cabecalho = OUTPUT_COLUMNS.map((c) => c.label);
  const dados = ordenadas.map((linha) => OUTPUT_COLUMNS.map((c) => String(linha[c.key] ?? "")));
  return `\uFEFF${Papa.unparse(
    { fields: cabecalho, data: dados },
    { delimiter: formato === "tsv" ? "\t" : ",", escapeFormulae: true, newline: "\r\n" }
  )}`;
}

export interface ArquivoAmazonPorTipo {
  tipoProduto: string;
  nomeSeguro: string;
  conteudo: string;
  totalVariacoes: number;
}

function nomeTipoSeguro(tipoProduto: string): string {
  return (tipoProduto || "sem-tipo")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "sem-tipo";
}

/**
 * Separa famílias completas por product_type. Isso evita misturar categorias
 * em um mesmo arquivo e facilita a conferência no template oficial de cada tipo.
 */
export function gerarArquivosAmazonPorTipo(
  linhas: ProcessedRow[],
  formato: FormatoSaida = "csv"
): ArquivoAmazonPorTipo[] {
  const tipos = new Map<string, ProcessedRow[]>();
  for (const linha of linhas) {
    const tipo = linha.tipoProduto.trim() || "Sem tipo";
    if (!tipos.has(tipo)) tipos.set(tipo, []);
    tipos.get(tipo)!.push(linha);
  }

  return Array.from(tipos, ([tipoProduto, linhasDoTipo]) => ({
    tipoProduto,
    nomeSeguro: nomeTipoSeguro(tipoProduto),
    conteudo: gerarCsvSaida(linhasDoTipo, formato),
    totalVariacoes: linhasDoTipo.filter((linha) => linha.tipo === "child").length,
  }));
}
