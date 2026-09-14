import { NextRequest, NextResponse } from "next/server";
import { erroServidor, removerCookieSessao, usuarioDaRequisicao } from "@/lib/server/auth";
import { colecoes } from "@/lib/server/mongodb";
import { origemPermitida } from "@/lib/server/security";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest) {
  if (!origemPermitida(request)) return NextResponse.json({ erro: "Origem da requisição não autorizada." }, { status: 403 });
  try {
    const sessao = await usuarioDaRequisicao(request);
    if (!sessao) return NextResponse.json({ erro: "Faça login para excluir a conta." }, { status: 401 });
    const { catalogs, sessions, users } = await colecoes();
    await catalogs.deleteMany({ ownerId: sessao.id });
    await sessions.deleteMany({ userId: sessao.id });
    await users.deleteOne({ _id: sessao.id });
    const response = NextResponse.json({ ok: true });
    removerCookieSessao(response);
    return response;
  } catch (erro) {
    return erroServidor(erro);
  }
}
