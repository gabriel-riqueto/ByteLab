import { NextRequest, NextResponse } from "next/server";
import { erroServidor, usuarioDaRequisicao } from "@/lib/server/auth";
import { colecoes, objectId } from "@/lib/server/mongodb";
import { origemPermitida } from "@/lib/server/security";

export const runtime = "nodejs";

interface Contexto {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, contexto: Contexto) {
  try {
    const sessao = await usuarioDaRequisicao(request);
    if (!sessao) return NextResponse.json({ erro: "Faça login para acessar este catálogo." }, { status: 401 });
    const id = await objectId((await contexto.params).id);
    if (!id) return NextResponse.json({ erro: "Catálogo inválido." }, { status: 400 });
    const { catalogs } = await colecoes();
    const catalogo = await catalogs.findOne({ _id: id, ownerId: sessao.id });
    if (!catalogo) return NextResponse.json({ erro: "Catálogo não encontrado." }, { status: 404 });
    return NextResponse.json({
      catalog: {
        id: catalogo._id.toString(),
        nome: catalogo.nome,
        nomeArquivo: catalogo.nomeArquivo,
        plataforma: catalogo.plataforma,
        totalVariacoes: catalogo.totalVariacoes,
        criadoEm: catalogo.createdAt.toISOString(),
        atualizadoEm: catalogo.updatedAt.toISOString(),
        config: catalogo.config,
        linhas: catalogo.linhas,
      },
    });
  } catch (erro) {
    return erroServidor(erro);
  }
}

export async function DELETE(request: NextRequest, contexto: Contexto) {
  if (!origemPermitida(request)) return NextResponse.json({ erro: "Origem da requisição não autorizada." }, { status: 403 });
  try {
    const sessao = await usuarioDaRequisicao(request);
    if (!sessao) return NextResponse.json({ erro: "Faça login para excluir este catálogo." }, { status: 401 });
    const id = await objectId((await contexto.params).id);
    if (!id) return NextResponse.json({ erro: "Catálogo inválido." }, { status: 400 });
    const { catalogs } = await colecoes();
    const resultado = await catalogs.deleteOne({ _id: id, ownerId: sessao.id });
    if (!resultado.deletedCount) return NextResponse.json({ erro: "Catálogo não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return erroServidor(erro);
  }
}
