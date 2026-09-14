import { BatchSettings, FieldIssue, InputRow, OrigemClassificacao, ProcessedRow, statusDaLinha } from "./types";
import {
  chave,
  detectarTipoProduto,
  derivarDeDepartamento,
  normalizarCor,
  normalizarDepartamento,
  normalizarTamanho,
  normalizarTipoProduto,
  tituloComercial,
} from "./dictionaries";
import { parsePreco, formatarPreco } from "./preco";
import { validarGtin } from "./gtin";
import { erro, aviso, comecaComoFormula, isUrlDeImagemValida } from "./validate";

const CODIGO_SKU_DUPLICADO = "sku_duplicado";
const CODIGO_VARIACAO_DUPLICADA = "variacao_duplicada";
const CODIGO_IMAGEM_INDISPONIVEL = "imagem_indisponivel";
const CODIGO_TIPO_DETECTADO = "tipo_produto_detectado";
const CODIGO_TIPO_NAO_RECONHECIDO = "tipo_produto_nao_reconhecido";
const CODIGO_TIPOS_CONFLITANTES = "tipos_produto_conflitantes";
const CODIGO_TIPO_DIVERGE_NOME = "tipo_produto_diverge_nome";
const CODIGO_DEPARTAMENTO_INVALIDO = "departamento_invalido";
const CODIGO_DEPARTAMENTOS_CONFLITANTES = "departamentos_conflitantes";
const CODIGO_NOME_AUSENTE = "nome_ausente";

const CODIGOS_PERSISTENTES = new Set([
  CODIGO_IMAGEM_INDISPONIVEL,
  "nomes_grupo_divergentes",
  CODIGO_TIPO_DETECTADO,
  CODIGO_TIPO_NAO_RECONHECIDO,
  CODIGO_TIPOS_CONFLITANTES,
  CODIGO_TIPO_DIVERGE_NOME,
  CODIGO_DEPARTAMENTO_INVALIDO,
  CODIGO_DEPARTAMENTOS_CONFLITANTES,
  CODIGO_NOME_AUSENTE,
]);

function hashCurto(texto: string): string {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) {
    h = (h * 33) ^ texto.charCodeAt(i);
  }
  return (h >>> 0).toString(36).slice(0, 6);
}

function slug(texto: string): string {
  return chave(texto)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

export function gerarSkuPai(nomeBase: string): string {
  const base = slug(nomeBase) || "PRODUTO";
  return `${base}-${hashCurto(chave(nomeBase))}`.toUpperCase();
}

/** item_name do filho = nome base do grupo + variação (cor/tamanho), para diferenciar cada SKU vendável. */
function nomeComVariacao(nomeBase: string, cor: string, tamanho: string): string {
  const sufixo = [cor, tamanho].filter(Boolean).join(" ");
  return sufixo ? `${nomeBase} - ${sufixo}` : nomeBase;
}

interface CamposFilho {
  sku: string;
  precoBruto: string;
  corBruta: string;
  tamanhoBruta: string;
  imagemUrl: string;
  quantidadeBruta: string;
  gtin: string;
}

interface ValorConfirmavel {
  valor: string;
  reconhecida: boolean;
}

interface ClassificacaoGrupo {
  tipoProduto: string;
  tipoProdutoOrigem: OrigemClassificacao;
  tipoProdutoConfirmado: boolean;
  departamento: string;
  departamentoOrigem: Exclude<OrigemClassificacao, "detectado">;
  generoAlvo: string;
  faixaEtaria: string;
  issues: FieldIssue[];
}

function valoresUnicos<T>(valores: T[], chaveValor: (valor: T) => string): T[] {
  const vistos = new Set<string>();
  return valores.filter((valor) => {
    const k = chaveValor(valor);
    if (!k || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

function resolverClassificacaoGrupo(linhas: InputRow[], config: BatchSettings): ClassificacaoGrupo {
  const issues: FieldIssue[] = [];
  const tiposInformados = valoresUnicos(
    linhas.map((linha) => linha.tipoProduto.trim()).filter(Boolean).map(normalizarTipoProduto),
    (tipo) => chave(tipo.valor)
  );

  let tipoProduto = "";
  let tipoProdutoOrigem: OrigemClassificacao = "detectado";
  let tipoProdutoConfirmado = false;

  if (tiposInformados.length > 0) {
    tipoProduto = tiposInformados[0].valor;
    tipoProdutoOrigem = "planilha";
    tipoProdutoConfirmado = tiposInformados.length === 1 && tiposInformados[0].reconhecido;
    if (tiposInformados.length > 1) {
      issues.push(
        erro(
          "tipoProduto",
          `O mesmo grupo possui tipos de produto diferentes (${tiposInformados.map((tipo) => tipo.valor).join(", ")}). Escolha um tipo para a família.`,
          CODIGO_TIPOS_CONFLITANTES
        )
      );
    } else if (!tiposInformados[0].reconhecido) {
      issues.push(
        aviso(
          "tipoProduto",
          `O tipo "${tiposInformados[0].valor}" veio da planilha, mas não está na lista comum do ByteLab. Confirme-o no template da Amazon.`,
          CODIGO_TIPO_NAO_RECONHECIDO
        )
      );
    } else {
      const detectadoPeloNome = detectarTipoProduto(linhas[0]?.grupo ?? "", ...linhas.map((linha) => linha.nome));
      if (detectadoPeloNome && detectadoPeloNome !== tipoProduto) {
        issues.push(
          erro(
            "tipoProduto",
            `O tipo informado (${tipoProduto}) parece divergir do nome do produto (${detectadoPeloNome}). Revise a classificação da família.`,
            CODIGO_TIPO_DIVERGE_NOME
          )
        );
      }
    }
  } else {
    const detectado = detectarTipoProduto(linhas[0]?.grupo ?? "", ...linhas.map((linha) => linha.nome));
    if (detectado) {
      tipoProduto = detectado;
      tipoProdutoOrigem = "detectado";
      issues.push(
        aviso(
          "tipoProduto",
          `Tipo de produto detectado pelo nome: ${detectado}. Confirme a classificação antes de exportar.`,
          CODIGO_TIPO_DETECTADO
        )
      );
    } else if (config.tipoProduto.trim()) {
      const padrao = normalizarTipoProduto(config.tipoProduto);
      tipoProduto = padrao.valor;
      tipoProdutoOrigem = "padrao";
      tipoProdutoConfirmado = padrao.reconhecido;
      if (!padrao.reconhecido) {
        issues.push(
          aviso(
            "tipoProduto",
            `O tipo padrão "${padrao.valor}" não está na lista comum do ByteLab. Confirme-o no template da Amazon.`,
            CODIGO_TIPO_NAO_RECONHECIDO
          )
        );
      }
    }
  }

  const departamentosInformados = valoresUnicos(
    linhas.map((linha) => linha.departamento.trim()).filter(Boolean).map(normalizarDepartamento),
    (departamento) => chave(departamento.valor)
  );
  let departamento = "";
  let departamentoOrigem: Exclude<OrigemClassificacao, "detectado"> = "padrao";

  if (departamentosInformados.length > 0) {
    departamento = departamentosInformados[0].valor;
    departamentoOrigem = "planilha";
    if (departamentosInformados.length > 1) {
      issues.push(
        erro(
          "departamento",
          `O mesmo grupo possui departamentos diferentes (${departamentosInformados.map((item) => item.valor).join(", ")}). Escolha um departamento para a família.`,
          CODIGO_DEPARTAMENTOS_CONFLITANTES
        )
      );
    } else if (!departamentosInformados[0].reconhecido) {
      issues.push(
        erro(
          "departamento",
          `O departamento "${departamentosInformados[0].valor}" não foi reconhecido. Selecione um valor aceito.`,
          CODIGO_DEPARTAMENTO_INVALIDO
        )
      );
    }
  } else if (config.departamento.trim()) {
    const padrao = normalizarDepartamento(config.departamento);
    departamento = padrao.valor;
    if (!padrao.reconhecido) {
      issues.push(
        erro(
          "departamento",
          `O departamento padrão "${padrao.valor}" não foi reconhecido. Selecione um valor aceito.`,
          CODIGO_DEPARTAMENTO_INVALIDO
        )
      );
    }
  }

  const { generoAlvo, faixaEtaria } = derivarDeDepartamento(departamento);
  return {
    tipoProduto,
    tipoProdutoOrigem,
    tipoProdutoConfirmado,
    departamento,
    departamentoOrigem,
    generoAlvo,
    faixaEtaria,
    issues,
  };
}

function configEfetivaDaLinha(linha: ProcessedRow, config: BatchSettings): BatchSettings {
  return {
    ...config,
    marca: linha.marca,
    departamento: linha.departamento,
    generoAlvo: linha.generoAlvo,
    faixaEtaria: linha.faixaEtaria,
    tipoProduto: linha.tipoProduto,
    sistemaTamanho: linha.sistemaTamanho,
  };
}

function issuesPersistentes(linha: ProcessedRow): FieldIssue[] {
  return linha.issues.filter((issue) => issue.codigo && CODIGOS_PERSISTENTES.has(issue.codigo));
}

function validarECalcularFilho(
  campos: CamposFilho,
  config: BatchSettings,
  corOverride?: ValorConfirmavel,
  tamanhoOverride?: ValorConfirmavel
): {
  issues: FieldIssue[];
  precoFormatado: string;
  cor: ValorConfirmavel;
  tamanho: ValorConfirmavel;
  gtin: string;
  gtinTipo: string;
} {
  const issues: FieldIssue[] = [];

  if (!campos.sku.trim()) issues.push(erro("sku", "SKU ausente.", "sku_ausente", campos.sku));
  else if (comecaComoFormula(campos.sku)) {
    issues.push(erro("sku", "O SKU não pode começar com =, +, - ou @.", "sku_inseguro", campos.sku));
  }

  const valorPreco = parsePreco(campos.precoBruto);
  if (valorPreco === null) {
    issues.push(erro("preco", `Preço inválido ou ausente ("${campos.precoBruto}").`, "preco_invalido", campos.precoBruto));
  }

  const cor = corOverride ?? normalizarCor(campos.corBruta);
  if (!campos.corBruta.trim()) {
    issues.push(erro("cor", "Cor ausente.", "cor_ausente", campos.corBruta));
  } else if (!cor.reconhecida) {
    issues.push(aviso("cor", `Cor "${campos.corBruta}" não foi normalizada — confira ou selecione o valor equivalente.`, "cor_nao_reconhecida", campos.corBruta));
  }

  const tamanho = tamanhoOverride ?? normalizarTamanho(campos.tamanhoBruta);
  if (!campos.tamanhoBruta.trim()) {
    issues.push(erro("tamanho", "Tamanho ausente.", "tamanho_ausente", campos.tamanhoBruta));
  } else if (!tamanho.reconhecida) {
    const texto = campos.tamanhoBruta;
    if (/^[=+@-]|[\x00-\x1f<>]/.test(texto) || /^0+(?:[.,]0+)?$/.test(texto)) {
      issues.push(erro("tamanho", `Formato de tamanho inválido ("${texto}").`, "tamanho_invalido", texto));
    } else {
      issues.push(aviso("tamanho", `Formato de tamanho não reconhecido ("${texto}"); revise antes de publicar.`, "tamanho_nao_reconhecido", texto));
    }
  }

  if (campos.imagemUrl.trim() && !isUrlDeImagemValida(campos.imagemUrl)) {
    issues.push(aviso("imagemUrl", "URL da imagem informada não parece válida (use http:// ou https://). A foto é opcional.", "imagem_invalida", campos.imagemUrl));
  }

  if (!/^\d+$/.test(campos.quantidadeBruta) || !Number.isSafeInteger(Number(campos.quantidadeBruta))) {
    issues.push(erro("quantidade", "A quantidade deve ser um número inteiro maior ou igual a zero.", "quantidade_invalida", campos.quantidadeBruta));
  }

  const resultadoGtin = validarGtin(campos.gtin);
  if (!campos.gtin.trim() && config.plataforma === "amazon" && !config.semGtinComIsencao) {
    issues.push(
      aviso(
        "gtin",
        "GTIN/EAN/UPC não informado. A Amazon exige um código de barras para a maioria dos produtos, a menos que você tenha isenção aprovada."
      )
    );
  } else if (campos.gtin.trim() && !resultadoGtin.valido) {
    issues.push(erro("gtin", resultadoGtin.mensagem ?? "GTIN inválido.", "gtin_invalido", campos.gtin));
  }

  if (!config.marca.trim()) issues.push(erro("marca", "Marca não definida para este lote.", "marca_ausente", config.marca));
  if (config.plataforma === "amazon" && !config.departamento.trim()) {
    issues.push(erro("departamento", "Departamento não definido para este lote.", "departamento_ausente", config.departamento));
  }
  if (config.plataforma === "amazon" && !config.tipoProduto.trim()) {
    issues.push(erro("tipoProduto", "Tipo de produto não definido para este lote.", "tipo_produto_ausente", config.tipoProduto));
  }
  if (config.plataforma === "mercado_livre" && !/^MLB\d{2,}$/.test(config.mlCategoriaId.trim())) {
    issues.push(erro("mlCategoriaId", "Informe um ID de categoria do Mercado Livre no formato MLB + números."));
  }
  if (!config.sistemaTamanho.trim()) issues.push(erro("sistemaTamanho", "Sistema de tamanho não definido para este lote.", "sistema_tamanho_ausente", config.sistemaTamanho));

  return {
    issues,
    precoFormatado: valorPreco !== null ? formatarPreco(valorPreco) : "",
    cor,
    tamanho,
    gtin: resultadoGtin.valor,
    gtinTipo: resultadoGtin.valido ? resultadoGtin.tipo : "",
  };
}

function linhaBase(config: BatchSettings): Pick<
  ProcessedRow,
  "marca" | "departamento" | "generoAlvo" | "faixaEtaria" | "tipoProduto" | "sistemaTamanho"
> {
  return {
    marca: config.marca.trim(),
    departamento: config.departamento.trim(),
    generoAlvo: config.generoAlvo.trim(),
    faixaEtaria: config.faixaEtaria.trim(),
    tipoProduto: config.tipoProduto.trim(),
    sistemaTamanho: config.sistemaTamanho.trim(),
  };
}

function construirFilho(
  linha: InputRow,
  config: BatchSettings,
  skuPai: string,
  nomePadronizado: string,
  classificacao: ClassificacaoGrupo
): ProcessedRow {
  const configEfetiva: BatchSettings = {
    ...config,
    departamento: classificacao.departamento,
    generoAlvo: classificacao.generoAlvo,
    faixaEtaria: classificacao.faixaEtaria,
    tipoProduto: classificacao.tipoProduto,
  };
  const { issues, precoFormatado, cor, tamanho, gtin, gtinTipo } = validarECalcularFilho(
    {
      sku: linha.sku,
      precoBruto: linha.preco,
      corBruta: linha.cor,
      tamanhoBruta: linha.tamanho,
      imagemUrl: linha.imagemUrl,
      quantidadeBruta: linha.quantidade === undefined ? String(config.quantidadePadrao) : linha.quantidade,
      gtin: linha.gtin,
    },
    configEfetiva
  );

  issues.push(...classificacao.issues);

  if (!linha.nome.trim()) issues.unshift(erro("nome", "Nome do produto ausente.", CODIGO_NOME_AUSENTE, linha.nome));

  return {
    id: `child-${linha.linha}-${linha.sku.trim() || linha.linha}`,
    tipo: "child",
    sku: linha.sku.trim(),
    skuPai,
    relationshipType: "variation",
    nome: nomeComVariacao(nomePadronizado || tituloComercial(linha.nome), cor.valor, tamanho.valor),
    nomeBase: nomePadronizado || tituloComercial(linha.nome),
    ...linhaBase(configEfetiva),
    tipoProdutoOrigem: classificacao.tipoProdutoOrigem,
    tipoProdutoConfirmado: classificacao.tipoProdutoConfirmado,
    departamentoOrigem: classificacao.departamentoOrigem,
    gtin,
    gtinTipo,
    preco: precoFormatado,
    precoOriginal: linha.preco,
    quantidade: linha.quantidade === undefined ? String(config.quantidadePadrao) : linha.quantidade,
    quantidadeOriginal: linha.quantidade,
    cor: cor.valor,
    corOriginal: linha.cor,
    corConfirmadaManualmente: false,
    tamanho: tamanho.valor,
    tamanhoOriginal: linha.tamanho,
    tamanhoConfirmadoManualmente: false,
    temaVariacao: "SizeColor",
    imagemUrl: linha.imagemUrl.trim(),
    issues,
    linhaOrigem: linha.linha,
  };
}

function construirPai(
  skuPai: string,
  nomePadronizado: string,
  config: BatchSettings,
  imagemUrl: string,
  classificacao: ClassificacaoGrupo
): ProcessedRow {
  const configEfetiva: BatchSettings = {
    ...config,
    departamento: classificacao.departamento,
    generoAlvo: classificacao.generoAlvo,
    faixaEtaria: classificacao.faixaEtaria,
    tipoProduto: classificacao.tipoProduto,
  };
  return {
    id: `parent-${skuPai}`,
    tipo: "parent",
    sku: skuPai,
    skuPai: "",
    relationshipType: "",
    nome: nomePadronizado || "(nome do produto ausente)",
    nomeBase: nomePadronizado || "(nome do produto ausente)",
    ...linhaBase(configEfetiva),
    tipoProdutoOrigem: classificacao.tipoProdutoOrigem,
    tipoProdutoConfirmado: classificacao.tipoProdutoConfirmado,
    departamentoOrigem: classificacao.departamentoOrigem,
    gtin: "",
    gtinTipo: "",
    preco: "",
    quantidade: "",
    cor: "",
    corOriginal: "",
    corConfirmadaManualmente: false,
    tamanho: "",
    tamanhoOriginal: "",
    tamanhoConfirmadoManualmente: false,
    temaVariacao: "SizeColor",
    imagemUrl,
    issues: nomePadronizado ? [] : [erro("nome", "Nenhuma linha deste grupo tem nome de produto.")],
    linhaOrigem: null,
  };
}

export interface ResultadoProcessamento {
  linhas: ProcessedRow[];
  totalGrupos: number;
  totalFilhos: number;
}

export function processarLinhas(entradas: InputRow[], config: BatchSettings): ResultadoProcessamento {
  const grupos = new Map<string, InputRow[]>();
  const ordemGrupos: string[] = [];

  for (const linha of entradas) {
    const chaveGrupo = chave(linha.grupo || linha.nome) || `sem-nome-linha-${linha.linha}`;
    if (!grupos.has(chaveGrupo)) {
      grupos.set(chaveGrupo, []);
      ordemGrupos.push(chaveGrupo);
    }
    grupos.get(chaveGrupo)!.push(linha);
  }

  const linhasSaida: ProcessedRow[] = [];

  for (const chaveGrupo of ordemGrupos) {
    const linhasGrupo = grupos.get(chaveGrupo)!;
    const nomeExemplo = linhasGrupo.find((linha) => linha.nome.trim())?.nome ?? linhasGrupo[0].nome;
    const nomePadronizado = tituloComercial(nomeExemplo || "");
    const skuPai = gerarSkuPai(linhasGrupo[0].grupo || nomeExemplo || chaveGrupo);
    const classificacao = resolverClassificacaoGrupo(linhasGrupo, config);

    const filhos: ProcessedRow[] = linhasGrupo.map((linha) =>
      construirFilho(linha, config, skuPai, nomePadronizado, classificacao)
    );

    if (linhasGrupo[0].grupo) {
      const nomesDiferentes = new Set(linhasGrupo.map((linha) => chave(linha.nome)).filter(Boolean));
      if (nomesDiferentes.size > 1) {
        for (const filho of filhos) {
          filho.issues.push(
            aviso("nome", "Este grupo contém nomes de produto diferentes; confirme o nome do produto pai.", "nomes_grupo_divergentes")
          );
        }
      }
    }

    linhasSaida.push(construirPai(skuPai, nomePadronizado, config, filhos[0]?.imagemUrl ?? "", classificacao));
    linhasSaida.push(...filhos);
  }

  return finalizarLinhas(linhasSaida);
}

/** Recalcula duplicidades, imagem principal e o tema de variação de cada grupo. */
export function finalizarLinhas(linhas: ProcessedRow[]): ResultadoProcessamento {
  const semDuplicidadeNemTema = linhas.map((l) => ({
    ...l,
    issues: l.issues.filter(
      (i) => i.codigo !== CODIGO_SKU_DUPLICADO && i.codigo !== CODIGO_VARIACAO_DUPLICADA
    ),
  }));

  const contagemSku = new Map<string, number>();
  for (const linha of semDuplicidadeNemTema) {
    if (linha.tipo === "child" && linha.sku) {
      contagemSku.set(linha.sku, (contagemSku.get(linha.sku) ?? 0) + 1);
    }
  }

  const filhosPorPai = new Map<string, ProcessedRow[]>();
  for (const linha of semDuplicidadeNemTema) {
    if (linha.tipo === "child") {
      if (!filhosPorPai.has(linha.skuPai)) filhosPorPai.set(linha.skuPai, []);
      filhosPorPai.get(linha.skuPai)!.push(linha);
    }
  }

  const temaPorPai = new Map<string, string>();
  const combinacoesPorPai = new Map<string, Map<string, number>>();
  for (const [skuPai, filhos] of filhosPorPai) {
    const cores = new Set(filhos.map((f) => f.cor).filter(Boolean));
    const tamanhos = new Set(filhos.map((f) => f.tamanho).filter(Boolean));
    let tema = "SizeColor";
    if (tamanhos.size <= 1 && cores.size > 1) tema = "Color";
    else if (cores.size <= 1 && tamanhos.size > 1) tema = "Size";
    temaPorPai.set(skuPai, tema);

    const combinacoes = new Map<string, number>();
    for (const filho of filhos) {
      if (!filho.cor || !filho.tamanho) continue;
      const combinacao = `${chave(filho.cor)}|${chave(filho.tamanho)}`;
      combinacoes.set(combinacao, (combinacoes.get(combinacao) ?? 0) + 1);
    }
    combinacoesPorPai.set(skuPai, combinacoes);
  }

  const finalizadas = semDuplicidadeNemTema
    .filter((linha) => linha.tipo === "child" || (filhosPorPai.get(linha.sku)?.length ?? 0) > 0)
    .map((linha) => {
      const tema = temaPorPai.get(linha.tipo === "parent" ? linha.sku : linha.skuPai) ?? "SizeColor";
      let issues = linha.issues;
      if (linha.tipo === "child" && linha.sku && (contagemSku.get(linha.sku) ?? 0) > 1) {
        issues = [
          ...issues,
          erro("sku", `SKU duplicado (aparece ${contagemSku.get(linha.sku)} vezes).`, CODIGO_SKU_DUPLICADO, linha.sku),
        ];
      }
      if (linha.tipo === "child" && linha.cor && linha.tamanho) {
        const combinacao = `${chave(linha.cor)}|${chave(linha.tamanho)}`;
        const repeticoes = combinacoesPorPai.get(linha.skuPai)?.get(combinacao) ?? 0;
        if (repeticoes > 1) {
          issues = [
            ...issues,
            erro(
              "variacao",
              `Combinação de cor e tamanho repetida neste grupo (${linha.cor} / ${linha.tamanho}).`,
              CODIGO_VARIACAO_DUPLICADA,
              `${linha.cor} / ${linha.tamanho}`
            ),
          ];
        }
      }
      if (linha.tipo === "parent") {
        const imagemPrincipal = filhosPorPai
          .get(linha.sku)
          ?.find((filho) => isUrlDeImagemValida(filho.imagemUrl))?.imagemUrl;
        return { ...linha, temaVariacao: tema, issues, imagemUrl: imagemPrincipal ?? "" };
      }
      return { ...linha, temaVariacao: tema, issues };
    });

  const totalGrupos = new Set(finalizadas.filter((l) => l.tipo === "parent").map((l) => l.sku)).size;
  const totalFilhos = finalizadas.filter((l) => l.tipo === "child").length;

  return { linhas: finalizadas, totalGrupos, totalFilhos };
}

/** Mantém somente filhos sem erro crítico e os respectivos pais, sem alterar as issues do lote original. */
export function prepararLinhasExportacao(linhas: ProcessedRow[]): ProcessedRow[] {
  const filhosValidos = linhas.filter((linha) => linha.tipo === "child" && statusDaLinha(linha) !== "bloqueado");
  const paisComVariacoes = new Set(filhosValidos.map((filho) => filho.skuPai));
  return linhas.filter((linha) =>
    linha.tipo === "child" ? statusDaLinha(linha) !== "bloqueado" : paisComVariacoes.has(linha.sku)
  );
}

/** Catálogos e sessões salvos antes da mudança podem trazer bloqueios antigos de imagem. */
export function atualizarValidacaoImagemOpcional(linhas: ProcessedRow[]): ProcessedRow[] {
  return linhas.map((linha) => ({
    ...linha,
    issues: linha.issues
      .filter((issue) => issue.codigo !== "imagem_ausente" && !(issue.campo === "imagemUrl" && issue.mensagem === "URL da imagem ausente."))
      .map((issue) => issue.campo === "imagemUrl" && issue.severidade === "erro"
        ? { ...issue, severidade: "aviso" as const }
        : issue),
  }));
}

export type CampoEditavel = "sku" | "cor" | "tamanho" | "preco" | "imagemUrl" | "quantidade" | "gtin";

export function editarCampoFilho(
  linha: ProcessedRow,
  campo: CampoEditavel,
  novoValor: string,
  config: BatchSettings
): ProcessedRow {
  const corBruta = campo === "cor" ? novoValor : linha.corOriginal;
  const tamanhoBruta = campo === "tamanho" ? novoValor : linha.tamanhoOriginal;
  const precoBruto = campo === "preco" ? novoValor : (linha.precoOriginal ?? linha.preco);
  const quantidadeBruta = campo === "quantidade" ? novoValor.trim() : linha.quantidade;
  const imagemUrl = campo === "imagemUrl" ? novoValor : linha.imagemUrl;
  const sku = campo === "sku" ? novoValor : linha.sku;
  const gtin = campo === "gtin" ? novoValor : linha.gtin;

  const corOverride = campo === "cor" ? undefined : linha.corConfirmadaManualmente ? { valor: linha.cor, reconhecida: true } : undefined;
  const tamanhoOverride =
    campo === "tamanho" ? undefined : linha.tamanhoConfirmadoManualmente ? { valor: linha.tamanho, reconhecida: true } : undefined;

  const configEfetiva = configEfetivaDaLinha(linha, config);
  const { issues: issuesCalculadas, precoFormatado, cor, tamanho, gtin: gtinNormalizado, gtinTipo } = validarECalcularFilho(
    { sku, precoBruto, corBruta, tamanhoBruta, imagemUrl, quantidadeBruta, gtin },
    configEfetiva,
    corOverride,
    tamanhoOverride
  );
  const persistentes = issuesPersistentes(linha).filter(
    (issue) => campo !== "imagemUrl" || issue.codigo !== CODIGO_IMAGEM_INDISPONIVEL
  );
  const issues = [...issuesCalculadas, ...persistentes];

  return {
    ...linha,
    sku: sku.trim(),
    gtin: gtinNormalizado,
    gtinTipo,
    preco: precoFormatado,
    precoOriginal: precoBruto,
    quantidade: quantidadeBruta,
    quantidadeOriginal: campo === "quantidade" ? quantidadeBruta : linha.quantidadeOriginal,
    nome: nomeComVariacao(linha.nomeBase, cor.valor, tamanho.valor),
    cor: cor.valor,
    corOriginal: corBruta,
    corConfirmadaManualmente: campo === "cor" ? false : linha.corConfirmadaManualmente,
    tamanho: tamanho.valor,
    tamanhoOriginal: tamanhoBruta,
    tamanhoConfirmadoManualmente: campo === "tamanho" ? false : linha.tamanhoConfirmadoManualmente,
    imagemUrl: imagemUrl.trim(),
    issues,
  };
}

/** Usada quando o vendedor escolhe manualmente um valor canônico no dropdown (não é mais reprocessado pelo dicionário). */
export function confirmarValorManual(
  linha: ProcessedRow,
  campo: "cor" | "tamanho",
  valorCanonico: string,
  config: BatchSettings
): ProcessedRow {
  const override: ValorConfirmavel = { valor: valorCanonico, reconhecida: true };
  const configEfetiva = configEfetivaDaLinha(linha, config);
  const { issues: issuesCalculadas, precoFormatado, cor, tamanho, gtin, gtinTipo } = validarECalcularFilho(
    {
      sku: linha.sku,
      precoBruto: linha.precoOriginal ?? linha.preco,
      corBruta: linha.corOriginal,
      tamanhoBruta: linha.tamanhoOriginal,
      imagemUrl: linha.imagemUrl,
      quantidadeBruta: linha.quantidade,
      gtin: linha.gtin,
    },
    configEfetiva,
    campo === "cor" ? override : undefined,
    campo === "tamanho" ? override : undefined
  );
  const issues = [...issuesCalculadas, ...issuesPersistentes(linha)];

  return {
    ...linha,
    preco: precoFormatado,
    gtin,
    gtinTipo,
    nome: nomeComVariacao(linha.nomeBase, cor.valor, tamanho.valor),
    cor: cor.valor,
    corConfirmadaManualmente: campo === "cor" ? true : linha.corConfirmadaManualmente,
    tamanho: tamanho.valor,
    tamanhoConfirmadoManualmente: campo === "tamanho" ? true : linha.tamanhoConfirmadoManualmente,
    issues,
  };
}

export type CampoClassificacaoGrupo = "tipoProduto" | "departamento";

/** Atualiza a classificação da família inteira e recalcula as validações de cada variação. */
export function editarClassificacaoGrupo(
  linhas: ProcessedRow[],
  skuPai: string,
  campo: CampoClassificacaoGrupo,
  novoValor: string,
  config: BatchSettings
): ProcessedRow[] {
  const tipoNormalizado = campo === "tipoProduto" ? normalizarTipoProduto(novoValor) : null;
  const departamentoNormalizado = campo === "departamento" ? normalizarDepartamento(novoValor) : null;
  const codigosRemovidos =
    campo === "tipoProduto"
      ? new Set([CODIGO_TIPO_DETECTADO, CODIGO_TIPO_NAO_RECONHECIDO, CODIGO_TIPOS_CONFLITANTES, CODIGO_TIPO_DIVERGE_NOME])
      : new Set([CODIGO_DEPARTAMENTO_INVALIDO, CODIGO_DEPARTAMENTOS_CONFLITANTES]);

  const atualizadas = linhas.map((linha) => {
    const pertenceAoGrupo =
      (linha.tipo === "parent" && linha.sku === skuPai) || (linha.tipo === "child" && linha.skuPai === skuPai);
    if (!pertenceAoGrupo) return linha;

    const issues = linha.issues.filter((issue) => !issue.codigo || !codigosRemovidos.has(issue.codigo));
    if (campo === "tipoProduto") {
      if (tipoNormalizado && novoValor.trim() && !tipoNormalizado.reconhecido) {
        issues.push(
          aviso(
            "tipoProduto",
            `O tipo "${tipoNormalizado.valor}" não está na lista comum do ByteLab. Confirme-o no template da Amazon.`,
            CODIGO_TIPO_NAO_RECONHECIDO
          )
        );
      }
      return {
        ...linha,
        tipoProduto: tipoNormalizado?.valor ?? "",
        tipoProdutoOrigem: "manual" as const,
        tipoProdutoConfirmado: Boolean(tipoNormalizado?.reconhecido),
        issues,
      };
    }

    const departamento = departamentoNormalizado?.valor ?? "";
    const derivado = derivarDeDepartamento(departamento);
    if (novoValor.trim() && !departamentoNormalizado?.reconhecido) {
      issues.push(
        erro(
          "departamento",
          `O departamento "${departamento}" não foi reconhecido. Selecione um valor aceito.`,
          CODIGO_DEPARTAMENTO_INVALIDO
        )
      );
    }
    return {
      ...linha,
      departamento,
      departamentoOrigem: "manual" as const,
      generoAlvo: derivado.generoAlvo,
      faixaEtaria: derivado.faixaEtaria,
      issues,
    };
  });

  return atualizadas.map((linha) => {
    if (linha.tipo !== "child" || linha.skuPai !== skuPai) return linha;
    return editarCampoFilho(linha, "sku", linha.sku, config);
  });
}

export function atualizarDisponibilidadeImagem(linha: ProcessedRow, disponivel: boolean): ProcessedRow {
  const issuesSemDisponibilidade = linha.issues.filter((issue) => issue.codigo !== CODIGO_IMAGEM_INDISPONIVEL);
  if (disponivel || !isUrlDeImagemValida(linha.imagemUrl)) {
    if (issuesSemDisponibilidade.length === linha.issues.length) return linha;
    return { ...linha, issues: issuesSemDisponibilidade };
  }

  if (issuesSemDisponibilidade.length !== linha.issues.length) return linha;
  return {
    ...linha,
    issues: [
      ...issuesSemDisponibilidade,
      aviso(
        "imagemUrl",
        "A URL é válida, mas a imagem não pôde ser carregada neste dispositivo.",
        CODIGO_IMAGEM_INDISPONIVEL
      ),
    ],
  };
}

/** Separa uma variação em um novo grupo, permitindo corrigir agrupamentos automáticos incorretos. */
export function criarGrupoParaFilho(
  linhas: ProcessedRow[],
  childId: string,
  novoNome: string
): ProcessedRow[] {
  const filho = linhas.find((linha) => linha.tipo === "child" && linha.id === childId);
  const nomeBase = tituloComercial(novoNome);
  if (!filho || !nomeBase) return linhas;

  const skusExistentes = new Set(linhas.filter((linha) => linha.tipo === "parent").map((linha) => linha.sku));
  const skuBase = gerarSkuPai(nomeBase);
  let skuPai = skuBase;
  let sufixo = 2;
  while (skusExistentes.has(skuPai)) {
    skuPai = `${skuBase}-${sufixo}`;
    sufixo++;
  }

  const novoPai: ProcessedRow = {
    ...filho,
    id: `parent-${skuPai}`,
    tipo: "parent",
    sku: skuPai,
    skuPai: "",
    relationshipType: "",
    nome: nomeBase,
    nomeBase,
    gtin: "",
    gtinTipo: "",
    preco: "",
    quantidade: "",
    cor: "",
    corOriginal: "",
    corConfirmadaManualmente: false,
    tamanho: "",
    tamanhoOriginal: "",
    tamanhoConfirmadoManualmente: false,
    imagemUrl: filho.imagemUrl,
    issues: [],
    linhaOrigem: null,
  };

  const atualizadas = linhas.map((linha) =>
    linha.id === childId
      ? {
          ...linha,
          skuPai,
          nomeBase,
          nome: nomeComVariacao(nomeBase, linha.cor, linha.tamanho),
        }
      : linha
  );
  return [...atualizadas, novoPai];
}

/** Reatribui um filho a outro grupo (pai) já existente no lote, identificado pelo seu SKU pai. */
export function moverParaGrupoExistente(linhas: ProcessedRow[], childId: string, skuPaiAlvo: string): ProcessedRow[] {
  const paiAlvo = linhas.find((l) => l.tipo === "parent" && l.sku === skuPaiAlvo);
  if (!paiAlvo) return linhas;
  const codigosClassificacao = new Set([
    CODIGO_TIPO_DETECTADO,
    CODIGO_TIPO_NAO_RECONHECIDO,
    CODIGO_TIPOS_CONFLITANTES,
    CODIGO_TIPO_DIVERGE_NOME,
    CODIGO_DEPARTAMENTO_INVALIDO,
    CODIGO_DEPARTAMENTOS_CONFLITANTES,
  ]);
  const issuesClassificacaoAlvo =
    linhas
      .find((linha) => linha.tipo === "child" && linha.skuPai === skuPaiAlvo)
      ?.issues.filter((issue) => issue.codigo && codigosClassificacao.has(issue.codigo)) ?? [];
  return linhas.map((l) =>
    l.id === childId
      ? {
          ...l,
          skuPai: paiAlvo.sku,
          nomeBase: paiAlvo.nomeBase,
          nome: nomeComVariacao(paiAlvo.nomeBase, l.cor, l.tamanho),
          marca: paiAlvo.marca,
          departamento: paiAlvo.departamento,
          departamentoOrigem: paiAlvo.departamentoOrigem,
          generoAlvo: paiAlvo.generoAlvo,
          faixaEtaria: paiAlvo.faixaEtaria,
          tipoProduto: paiAlvo.tipoProduto,
          tipoProdutoOrigem: paiAlvo.tipoProdutoOrigem,
          tipoProdutoConfirmado: paiAlvo.tipoProdutoConfirmado,
          sistemaTamanho: paiAlvo.sistemaTamanho,
          issues: [
            ...l.issues.filter((issue) => !issue.codigo || !codigosClassificacao.has(issue.codigo)),
            ...issuesClassificacaoAlvo,
          ],
        }
      : l
  );
}

/** Renomeia um grupo (pai) e propaga o novo nome-base para todos os seus filhos, preservando o sufixo de variação. */
export function renomearGrupo(linhas: ProcessedRow[], skuPai: string, novoNome: string): ProcessedRow[] {
  const nomeBaseNovo = tituloComercial(novoNome);
  return linhas.map((l) => {
    if (l.sku === skuPai && l.tipo === "parent") {
      return { ...l, nomeBase: nomeBaseNovo, nome: nomeBaseNovo };
    }
    if (l.skuPai === skuPai && l.tipo === "child") {
      return {
        ...l,
        nomeBase: nomeBaseNovo,
        nome: nomeComVariacao(nomeBaseNovo, l.cor, l.tamanho),
        issues: l.issues.filter((issue) => issue.codigo !== "nomes_grupo_divergentes" && issue.codigo !== CODIGO_NOME_AUSENTE),
      };
    }
    return l;
  });
}

export interface GrupoExibicao {
  pai: ProcessedRow;
  filhos: ProcessedRow[];
}

export function agruparParaExibicao(linhas: ProcessedRow[]): GrupoExibicao[] {
  const pais = linhas.filter((l) => l.tipo === "parent");
  const filhosPorPai = new Map<string, ProcessedRow[]>();
  for (const linha of linhas) {
    if (linha.tipo !== "child") continue;
    if (!filhosPorPai.has(linha.skuPai)) filhosPorPai.set(linha.skuPai, []);
    filhosPorPai.get(linha.skuPai)!.push(linha);
  }
  return pais
    .map((pai) => ({ pai, filhos: filhosPorPai.get(pai.sku) ?? [] }))
    .filter((g) => g.filhos.length > 0);
}
