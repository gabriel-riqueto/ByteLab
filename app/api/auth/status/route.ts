import { NextRequest, NextResponse } from "next/server";
import { erroServidor, usuarioDaRequisicao } from "@/lib/server/auth";
import { mongoConfigurado } from "@/lib/server/mongodb";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!mongoConfigurado()) return NextResponse.json({ configured: false, user: null });
  try {
    const sessao = await usuarioDaRequisicao(request);
    return NextResponse.json({ configured: true, user: sessao?.publico ?? null });
  } catch (erro) {
    return erroServidor(erro);
  }
}
