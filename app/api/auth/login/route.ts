import { NextRequest, NextResponse } from "next/server";
import { aplicarCookieSessao, criarSessao, erroServidor, limiteExcedido, limparFalhas, registrarFalha } from "@/lib/server/auth";
import { colecoes } from "@/lib/server/mongodb";
import { hashSenha, ipDaRequisicao, origemPermitida, senhaConfere } from "@/lib/server/security";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!origemPermitida(request)) return NextResponse.json({ erro: "Origem da requisição não autorizada." }, { status: 403 });
  try {
    const corpo = (await request.json()) as Record<string, unknown>;
    const email = typeof corpo.email === "string" ? corpo.email.trim().toLowerCase().slice(0, 254) : "";
    const senha = typeof corpo.senha === "string" ? corpo.senha : "";
    const identificador = `login:${ipDaRequisicao(request)}:${email}`;

    if (await limiteExcedido(identificador)) {
      return NextResponse.json({ erro: "Muitas tentativas. Aguarde 15 minutos e tente novamente." }, { status: 429 });
    }

    const { users } = await colecoes();
    const usuario = email ? await users.findOne({ email }) : null;
    let valido = false;
    if (usuario) {
      valido = Boolean(senha && (await senhaConfere(senha, usuario.passwordSalt, usuario.passwordHash)));
    } else {
      // Mantém custo semelhante para reduzir diferenças de tempo que poderiam revelar contas existentes.
      await hashSenha(senha || "senha-invalida");
    }
    if (!usuario || !valido) {
      await registrarFalha(identificador);
      return NextResponse.json({ erro: "E-mail ou senha inválidos." }, { status: 401 });
    }

    const sessao = await criarSessao(usuario._id);
    await limparFalhas(identificador);
    const response = NextResponse.json({ user: { id: usuario._id.toString(), nome: usuario.nome, email: usuario.email } });
    aplicarCookieSessao(response, sessao.token, sessao.expiresAt);
    return response;
  } catch (erro) {
    return erroServidor(erro);
  }
}
