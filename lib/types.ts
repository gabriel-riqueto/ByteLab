export interface InputRow {
  linha: number;
  sku: string;
  nome: string;
  grupo: string;
  tipoProduto: string;
  departamento: string;
  preco: string;
  cor: string;
  tamanho: string;
  imagemUrl: string;
  gtin: string;
  /** undefined: coluna não informada; "": célula informada, mas vazia. */
  quantidade?: string;
}

export interface BatchSettings {
  plataforma: PlataformaDestino;
  marca: string;
  departamento: string;
  tipoProduto: string;
  quantidadePadrao: number;
  generoAlvo: string;
  faixaEtaria: string;
  sistemaTamanho: string;
  semGtinComIsencao: boolean;
  mlCategoriaId: string;
  mlCondicao: "new" | "used";
  mlTipoAnuncio: string;
}

export type PlataformaDestino = "amazon" | "mercado_livre";

export interface UsuarioSessao {
  id: string;
  nome: string;
  email: string;
}

export interface CatalogoSalvoResumo {
  id: string;
  nome: string;
  plataforma: PlataformaDestino;
  totalVariacoes: number;
  criadoEm: string;
  atualizadoEm: string;
}

export interface CatalogoSalvo extends CatalogoSalvoResumo {
  nomeArquivo: string;
  config: BatchSettings;
  linhas: ProcessedRow[];
}

export type Severity = "erro" | "aviso";

export interface FieldIssue {
  campo: string;
  severidade: Severity;
  mensagem: string;
  codigo?: string;
  valorEncontrado?: string;
}

export type StatusLinha = "ok" | "aviso" | "bloqueado";

export type LinhaTipo = "parent" | "child";

export type OrigemClassificacao = "planilha" | "detectado" | "padrao" | "manual";

export interface ProcessedRow {
  id: string;
  tipo: LinhaTipo;
  sku: string;
  skuPai: string;
  relationshipType: string;
  nome: string;
  nomeBase: string;
  marca: string;
  departamento: string;
  generoAlvo: string;
  faixaEtaria: string;
  tipoProduto: string;
  tipoProdutoOrigem?: OrigemClassificacao;
  tipoProdutoConfirmado?: boolean;
  departamentoOrigem?: Exclude<OrigemClassificacao, "detectado">;
  gtin: string;
  gtinTipo: string;
  preco: string;
  precoOriginal?: string;
  quantidade: string;
  quantidadeOriginal?: string;
  sistemaTamanho: string;
  cor: string;
  corOriginal: string;
  corConfirmadaManualmente: boolean;
  tamanho: string;
  tamanhoOriginal: string;
  tamanhoConfirmadoManualmente: boolean;
  temaVariacao: string;
  imagemUrl: string;
  issues: FieldIssue[];
  linhaOrigem: number | null;
}

export function statusDaLinha(linha: ProcessedRow): StatusLinha {
  if (linha.issues.some((i) => i.severidade === "erro")) return "bloqueado";
  if (linha.issues.some((i) => i.severidade === "aviso")) return "aviso";
  return "ok";
}

export const OUTPUT_COLUMNS: { key: keyof ProcessedRow; label: string }[] = [
  { key: "sku", label: "sku" },
  { key: "skuPai", label: "parent_sku" },
  { key: "tipo", label: "parentage" },
  { key: "relationshipType", label: "relationship_type" },
  { key: "nome", label: "item_name" },
  { key: "marca", label: "brand_name" },
  { key: "departamento", label: "department_name" },
  { key: "generoAlvo", label: "target_gender" },
  { key: "faixaEtaria", label: "age_range_description" },
  { key: "tipoProduto", label: "product_type" },
  { key: "gtin", label: "external_product_id" },
  { key: "gtinTipo", label: "external_product_id_type" },
  { key: "preco", label: "standard_price" },
  { key: "quantidade", label: "quantity" },
  { key: "sistemaTamanho", label: "size_system" },
  { key: "cor", label: "color_name" },
  { key: "tamanho", label: "size_name" },
  { key: "temaVariacao", label: "variation_theme" },
  { key: "imagemUrl", label: "main_image_url" },
];
