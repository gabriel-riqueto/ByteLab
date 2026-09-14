import { FieldIssue, ProcessedRow } from "./types";

export interface ProblemaProduto {
  id: string;
  linhaId: string;
  linhaOrigem: number | null;
  sku: string;
  produto: string;
  campo: string;
  valorEncontrado: string;
  issue: FieldIssue;
  categoria: string;
  rotulo: string;
}

export interface CategoriaProblemas {
  id: string;
  rotulo: string;
  severidade: FieldIssue["severidade"];
  problemas: ProblemaProduto[];
}

const ROTULOS: Record<string, string> = {
  sku_ausente: "SKU vazio", sku_duplicado: "SKU duplicado", sku_inseguro: "SKU inválido",
  variacao_duplicada: "Variação duplicada", nome_ausente: "Campo obrigatório: produto",
  cor_ausente: "Campo obrigatório: cor", cor_nao_reconhecida: "Cor não normalizada",
  tamanho_ausente: "Campo obrigatório: tamanho", tamanho_invalido: "Tamanho inválido",
  tamanho_nao_reconhecido: "Tamanho não reconhecido", preco_invalido: "Preço inválido",
  quantidade_invalida: "Estoque inválido",
  imagem_invalida: "Imagem inválida", imagem_indisponivel: "Imagem indisponível",
  gtin_invalido: "GTIN inválido", tipo_produto_ausente: "Campo obrigatório: tipo",
  tipo_produto_detectado: "Tipo detectado: confirmar", tipo_produto_nao_reconhecido: "Tipo não reconhecido",
  tipos_produto_conflitantes: "Tipos conflitantes", tipo_produto_diverge_nome: "Tipo divergente",
  departamento_ausente: "Campo obrigatório: departamento", departamento_invalido: "Departamento inválido",
  departamentos_conflitantes: "Departamentos conflitantes", marca_ausente: "Campo obrigatório: marca",
  sistema_tamanho_ausente: "Campo obrigatório: sistema de tamanho",
  nomes_grupo_divergentes: "Nomes divergentes no grupo",
};

function valorDoCampo(linha: ProcessedRow, campo: string): string {
  const campos: Record<string, string> = {
    sku: linha.sku, nome: linha.nomeBase, preco: linha.precoOriginal ?? linha.preco,
    quantidade: linha.quantidadeOriginal ?? linha.quantidade, cor: linha.corOriginal,
    tamanho: linha.tamanhoOriginal, imagemUrl: linha.imagemUrl, gtin: linha.gtin,
    tipoProduto: linha.tipoProduto, departamento: linha.departamento, marca: linha.marca,
    sistemaTamanho: linha.sistemaTamanho, variacao: `${linha.cor} / ${linha.tamanho}`,
  };
  return campos[campo] ?? "";
}

/** Usa exclusivamente as issues calculadas durante a normalização (inclusive após edições). */
export function resumirValidacao(linhas: ProcessedRow[]) {
  const filhos = linhas.filter((linha) => linha.tipo === "child");
  const categorias = new Map<string, CategoriaProblemas>();
  let alertas = 0;
  let errosCriticos = 0;
  for (const linha of filhos) {
    linha.issues.forEach((issue, indice) => {
      if (issue.severidade === "erro") errosCriticos++;
      else alertas++;
      const codigo = issue.codigo ?? `${issue.campo}:${issue.mensagem}`;
      const id = `${issue.severidade}:${codigo}`;
      if (!categorias.has(id)) {
        categorias.set(id, { id, rotulo: ROTULOS[codigo] ?? issue.mensagem, severidade: issue.severidade, problemas: [] });
      }
      categorias.get(id)!.problemas.push({
        id: `${linha.id}:${indice}`, linhaId: linha.id, linhaOrigem: linha.linhaOrigem,
        sku: linha.sku, produto: linha.nomeBase, campo: issue.campo,
        valorEncontrado: issue.valorEncontrado ?? valorDoCampo(linha, issue.campo),
        issue, categoria: id, rotulo: ROTULOS[codigo] ?? issue.mensagem,
      });
    });
  }
  return { skusLidos: filhos.length, alertas, errosCriticos, categorias: [...categorias.values()] };
}
