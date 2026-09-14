import { FieldIssue } from "./types";

export function isUrlDeImagemValida(url: string): boolean {
  if (!url.trim()) return false;
  try {
    const u = new URL(url.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function erro(campo: string, mensagem: string, codigo?: string, valorEncontrado?: string): FieldIssue {
  return { campo, severidade: "erro", mensagem, codigo, valorEncontrado };
}

export function aviso(campo: string, mensagem: string, codigo?: string, valorEncontrado?: string): FieldIssue {
  return { campo, severidade: "aviso", mensagem, codigo, valorEncontrado };
}

export function comecaComoFormula(valor: string): boolean {
  return /^[\s\t\r\n]*[=+\-@]/.test(valor);
}
