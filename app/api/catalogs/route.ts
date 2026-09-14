import { NextRequest, NextResponse } from "next/server";
import { erroServidor, usuarioDaRequisicao } from "@/lib/server/auth";
import { CatalogDocument, colecoes } from "@/lib/server/mongodb";
import { origemPermitida } from "@/lib/server/security";
import { BatchSettings, ProcessedRow } from "@/lib/types";

export const runtime = "nodejs";

const TAMANHO_MAXIMO_REQUISICAO = 8 * 1024 * 1024;
const MAX_CATALOGOS = 50;
const MAX_LINHAS = 5_000;

function configuracaoValida(config: unknown): config is BatchSettings {
  if (!config || typeof config !== "object") return false;
  const valor = config as Record<string, unknown>;
  const strings = [
    valor.marca,
    valor.departamento,
    valor.tipoProduto,
    valor.generoAlvo,
    valor.faixaEtaria,
    valor.sistemaTamanho,
    valor.mlCategoriaId,
    valor.mlTipoAnuncio,
  ];
  return (
    (valor.plataforma === "amazon" || valor.plataforma === "mercado_livre") &&
    strings.every((campo) => typeof campo === "string" && campo.length <= 180) &&
    Number.isInteger(valor.quantidadePadrao) &&
    Number(valor.quantidadePadrao) >= 0 &&
    Number(valor.quantidadePadrao) <= 10_000_000 &&
    typeof valor.semGtinComIsencao === "boolean" &&
    (valor.mlCondicao === "new" || valor.mlCondicao === "used")
  );
}

function linhasValidas(linhas: unknown): linhas is ProcessedRow[] {
  return (
    Array.isArray(linhas) &&
    linhas.length > 0 &&
    linhas.length <= MAX_LINHAS &&
    linhas.every((linha) => {
      if (!linha || typeof linha !== "object") return false;
      const valor = linha as Record<string, unknown>;
      const camposTexto = ["id", "sku", "skuPai", "nome", "nomeBase", "preco", "quantidade", "cor", "tamanho", "imagemUrl"];
      return (
        camposTexto.every((campo) => typeof valor[campo] === "string" && (valor[campo] as string).length <= 2_500) &&
        (valor.tipo === "parent" || valor.tipo === "child") &&
        Array.isArray(valor.issues) &&
        valor.issues.length <= 30
      );
    })
  );
}

function resumo(documento: CatalogDocument & { _id: { toString(): string } }) {
  return {
    id: documento._id.toString(),
    nome: documento.nome,
    plataforma: documento.plataforma,
    totalVariacoes: documento.totalVariacoes,
    criadoEm: documento.createdAt.toISOString(),
    atualizadoEm: documento.updatedAt.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const sessao = await usuarioDaRequisicao(request);
    if (!sessao) return NextResponse.json({ erro: "Faça login para acessar seus catálogos." }, { status: 401 });
    const { catalogs } = await colecoes();
    const documentos = await catalogs.find({ ownerId: sessao.id }).sort({ updatedAt: -1 }).limit(MAX_CATALOGOS).toArray();
    return NextResponse.json({ catalogs: documentos.map(resumo) });
  } catch (erro) {
    return erroServidor(erro);
  }
}

export async function POST(request: NextRequest) {
  if (!origemPermitida(request)) return NextResponse.json({ erro: "Origem da requisição não autorizada." }, { status: 403 });
  const tamanho = Number(request.headers.get("content-length") || 0);
  if (tamanho > TAMANHO_MAXIMO_REQUISICAO) {
    return NextResponse.json({ erro: "O catálogo ultrapassa o limite de 8 MB para salvamento." }, { status: 413 });
  }

  try {
    const sessao = await usuarioDaRequisicao(request);
    if (!sessao) return NextResponse.json({ erro: "Faça login para salvar o catálogo." }, { status: 401 });
    const textoCorpo = await request.text();
    if (new TextEncoder().encode(textoCorpo).byteLength > TAMANHO_MAXIMO_REQUISICAO) {
      return NextResponse.json({ erro: "O catálogo ultrapassa o limite de 8 MB para salvamento." }, { status: 413 });
    }
    const corpo = JSON.parse(textoCorpo) as Record<string, unknown>;
    const nome = typeof corpo.nome === "string" ? corpo.nome.trim().replace(/\s+/g, " ").slice(0, 120) : "";
    const nomeArquivo = typeof corpo.nomeArquivo === "string" ? corpo.nomeArquivo.trim().slice(0, 180) : "";

    if (!nome || !configuracaoValida(corpo.config) || !linhasValidas(corpo.linhas)) {
      return NextResponse.json({ erro: "Os dados do catálogo são inválidos ou excedem os limites permitidos." }, { status: 400 });
    }

    const { catalogs } = await colecoes();
    const existentes = await catalogs.find({ ownerId: sessao.id }, { projection: { _id: 1 } }).limit(MAX_CATALOGOS + 1).toArray();
    if (existentes.length >= MAX_CATALOGOS) {
      return NextResponse.json({ erro: `O limite de ${MAX_CATALOGOS} catálogos por conta foi atingido.` }, { status: 409 });
    }

    const agora = new Date();
    const config = corpo.config;
    const linhas = corpo.linhas;
    const resultado = await catalogs.insertOne({
      ownerId: sessao.id,
      nome,
      nomeArquivo,
      plataforma: config.plataforma,
      totalVariacoes: linhas.filter((linha) => linha.tipo === "child").length,
      config: config as unknown as Record<string, unknown>,
      linhas,
      createdAt: agora,
      updatedAt: agora,
    });
    return NextResponse.json({ id: resultado.insertedId.toString() }, { status: 201 });
  } catch (erro) {
    return erroServidor(erro);
  }
}
