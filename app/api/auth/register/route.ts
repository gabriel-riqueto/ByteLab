import { NextRequest, NextResponse } from "next/server";
import { aplicarCookieSessao, criarSessao, erroServidor, limiteExcedido, limparFalhas, registrarFalha } from "@/lib/server/auth";
import { colecoes } from "@/lib/server/mongodb";
import { hashSenha, ipDaRequisicao, origemPermitida } from "@/lib/server/security";

export const runtime = "nodejs";

function emailValido(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: NextRequest) {
  if (!origemPermitida(request)) return NextResponse.json({ erro: "Origem da requisição não autorizada." }, { status: 403 });
  try {
    const corpo = (await request.json()) as Record<string, unknown>;
    const nome = typeof corpo.nome === "string" ? corpo.nome.trim().replace(/\s+/g, " ").slice(0, 80) : "";
    const email = typeof corpo.email === "string" ? corpo.email.trim().toLowerCase() : "";
    const senha = typeof corpo.senha === "string" ? corpo.senha : "";
    const aceitouPrivacidade = corpo.aceitouPrivacidade === true;
    const identificador = `registro:${ipDaRequisicao(request)}:${email}`;

    if (await limiteExcedido(identificador)) {
      return NextResponse.json({ erro: "Muitas tentativas. Aguarde 15 minutos e tente novamente." }, { status: 429 });
    }
    if (nome.length < 2 || !emailValido(email) || senha.length < 10 || senha.length > 128 || !aceitouPrivacidade) {
      await registrarFalha(identificador);
      return NextResponse.json(
        { erro: "Informe nome, e-mail válido, senha de 10 a 128 caracteres e aceite o aviso de privacidade." },
        { status: 400 }
      );
    }

    const { users } = await colecoes();
    if (await users.findOne({ email })) {
      await registrarFalha(identificador);
      return NextResponse.json({ erro: "Já existe uma conta com este e-mail." }, { status: 409 });
    }

    const senhaProtegida = await hashSenha(senha);
    const agora = new Date();
    let inserido;
    try {
      inserido = await users.insertOne({
        nome,
        email,
        passwordSalt: senhaProtegida.salt,
        passwordHash: senhaProtegida.hash,
        privacyAcceptedAt: agora,
        createdAt: agora,
        updatedAt: agora,
      });
    } catch (erro) {
      if (typeof erro === "object" && erro && "code" in erro && erro.code === 11000) {
        return NextResponse.json({ erro: "Já existe uma conta com este e-mail." }, { status: 409 });
      }
      throw erro;
    }

    const sessao = await criarSessao(inserido.insertedId);
    await limparFalhas(identificador);
    const response = NextResponse.json({ user: { id: inserido.insertedId.toString(), nome, email } }, { status: 201 });
    aplicarCookieSessao(response, sessao.token, sessao.expiresAt);
    return response;
  } catch (erro) {
    return erroServidor(erro);
  }
}
