import "server-only";

import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { NextRequest } from "next/server";

const scryptAsync = promisify(scrypt);

function segredo(): string {
  const valor = process.env.BYTELAB_SESSION_SECRET?.trim();
  if (!valor || valor.length < 32) {
    throw new Error("BYTELAB_SESSION_SECRET deve ter pelo menos 32 caracteres.");
  }
  return valor;
}

export async function hashSenha(senha: string): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(16).toString("base64url");
  const derivada = (await scryptAsync(senha, salt, 64)) as Buffer;
  return { salt, hash: derivada.toString("base64url") };
}

export async function senhaConfere(senha: string, salt: string, hash: string): Promise<boolean> {
  try {
    const esperada = Buffer.from(hash, "base64url");
    const recebida = (await scryptAsync(senha, salt, esperada.length)) as Buffer;
    return esperada.length === recebida.length && timingSafeEqual(esperada, recebida);
  } catch {
    return false;
  }
}

export function novoTokenSessao(): string {
  return randomBytes(32).toString("base64url");
}

export function hashTokenSessao(token: string): string {
  return createHmac("sha256", segredo()).update(token).digest("hex");
}

export function chaveLimite(valor: string): string {
  return createHash("sha256").update(`${segredo()}:${valor}`).digest("hex");
}

export function origemPermitida(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
  if (!host) return false;
  try {
    return new URL(origin).origin === `${protocol}://${host}`;
  } catch {
    return false;
  }
}

export function ipDaRequisicao(request: NextRequest): string {
  return (request.headers.get("x-forwarded-for")?.split(",")[0] || request.headers.get("x-real-ip") || "desconhecido")
    .trim()
    .slice(0, 80);
}
