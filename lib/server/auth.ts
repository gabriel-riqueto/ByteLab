import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { colecoes, MongoId, UserDocument } from "./mongodb";
import { chaveLimite, hashTokenSessao, novoTokenSessao } from "./security";
import { UsuarioSessao } from "../types";

export const COOKIE_SESSAO = "bytelab_session";
export const DURACAO_SESSAO_MS = 7 * 24 * 60 * 60 * 1000;
const JANELA_LIMITE_MS = 15 * 60 * 1000;
const MAX_TENTATIVAS = 5;

function usuarioPublico(id: MongoId, usuario: UserDocument): UsuarioSessao {
  return { id: id.toString(), nome: usuario.nome, email: usuario.email };
}

export async function criarSessao(userId: MongoId): Promise<{ token: string; expiresAt: Date }> {
  const token = novoTokenSessao();
  const expiresAt = new Date(Date.now() + DURACAO_SESSAO_MS);
  const { sessions } = await colecoes();
  await sessions.insertOne({ tokenHash: hashTokenSessao(token), userId, createdAt: new Date(), expiresAt });
  return { token, expiresAt };
}

export function aplicarCookieSessao(response: NextResponse, token: string, expiresAt: Date): void {
  response.cookies.set(COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function removerCookieSessao(response: NextResponse): void {
  response.cookies.set(COOKIE_SESSAO, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
}

export async function usuarioDaRequisicao(
  request: NextRequest
): Promise<{ id: MongoId; usuario: UserDocument; publico: UsuarioSessao } | null> {
  const token = request.cookies.get(COOKIE_SESSAO)?.value;
  if (!token) return null;
  const { sessions, users } = await colecoes();
  const sessao = await sessions.findOne({ tokenHash: hashTokenSessao(token), expiresAt: { $gt: new Date() } });
  if (!sessao) return null;
  const usuario = await users.findOne({ _id: sessao.userId });
  if (!usuario) return null;
  return { id: usuario._id, usuario, publico: usuarioPublico(usuario._id, usuario) };
}

export async function encerrarSessao(request: NextRequest): Promise<void> {
  const token = request.cookies.get(COOKIE_SESSAO)?.value;
  if (!token) return;
  const { sessions } = await colecoes();
  await sessions.deleteOne({ tokenHash: hashTokenSessao(token) });
}

export async function limiteExcedido(identificador: string): Promise<boolean> {
  const key = chaveLimite(identificador);
  const { loginAttempts } = await colecoes();
  const atual = await loginAttempts.findOne({ key });
  return Boolean(atual && atual.expiresAt > new Date() && atual.count >= MAX_TENTATIVAS);
}

export async function registrarFalha(identificador: string): Promise<void> {
  const key = chaveLimite(identificador);
  const { loginAttempts } = await colecoes();
  const atual = await loginAttempts.findOne({ key });
  const agora = new Date();
  if (!atual || atual.expiresAt <= agora) {
    const expiresAt = new Date(agora.getTime() + JANELA_LIMITE_MS);
    try {
      await loginAttempts.insertOne({ key, count: 1, windowStartedAt: agora, expiresAt });
    } catch {
      await loginAttempts.updateOne({ key }, { $inc: { count: 1 } });
    }
    return;
  }
  await loginAttempts.updateOne({ key }, { $inc: { count: 1 } });
}

export async function limparFalhas(identificador: string): Promise<void> {
  const { loginAttempts } = await colecoes();
  await loginAttempts.deleteOne({ key: chaveLimite(identificador) });
}

export function erroServidor(erro: unknown): NextResponse {
  const mensagem = erro instanceof Error ? erro.message : "Falha desconhecida";
  const configuracao = mensagem.includes("MONGODB_") || mensagem.includes("BYTELAB_") || mensagem.includes("driver mongodb");
  return NextResponse.json(
    {
      erro: configuracao
        ? "O armazenamento ainda não foi configurado pelo responsável. Consulte MONGODB_SETUP.md."
        : "Não foi possível concluir a operação agora.",
    },
    { status: 503 }
  );
}
