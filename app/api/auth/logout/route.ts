import { NextRequest, NextResponse } from "next/server";
import { encerrarSessao, removerCookieSessao } from "@/lib/server/auth";
import { origemPermitida } from "@/lib/server/security";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!origemPermitida(request)) return NextResponse.json({ erro: "Origem da requisição não autorizada." }, { status: 403 });
  try {
    await encerrarSessao(request);
  } catch {
    // O cookie local ainda deve ser removido se o banco estiver temporariamente indisponível.
  }
  const response = NextResponse.json({ ok: true });
  removerCookieSessao(response);
  return response;
}
