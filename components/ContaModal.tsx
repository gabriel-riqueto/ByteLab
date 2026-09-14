"use client";

import { FormEvent, useEffect, useState } from "react";
import { UsuarioSessao } from "@/lib/types";

interface Props {
  configurado: boolean | null;
  usuario: UsuarioSessao | null;
  onFechar: () => void;
  onUsuarioAlterado: (usuario: UsuarioSessao | null) => void;
  modoPagina?: boolean;
}

type Modo = "entrar" | "criar";

export default function ContaModal({ configurado, usuario, onFechar, onUsuarioAlterado, modoPagina = false }: Props) {
  const [modo, setModo] = useState<Modo>("entrar");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [aceitou, setAceitou] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState("");
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  useEffect(() => {
    if (modoPagina) return;
    function fechar(evento: KeyboardEvent) {
      if (evento.key === "Escape") onFechar();
    }
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [modoPagina, onFechar]);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    setProcessando(true);
    try {
      const rota = modo === "entrar" ? "/api/auth/login" : "/api/auth/register";
      const response = await fetch(rota, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, email, senha, aceitouPrivacidade: aceitou }),
      });
      const dados = (await response.json()) as { user?: UsuarioSessao; erro?: string };
      if (!response.ok || !dados.user) throw new Error(dados.erro || "Não foi possível acessar a conta.");
      onUsuarioAlterado(dados.user);
      onFechar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível acessar a conta.");
    } finally {
      setProcessando(false);
    }
  }

  async function sair() {
    setProcessando(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      onUsuarioAlterado(null);
      onFechar();
    } finally {
      setProcessando(false);
    }
  }

  async function excluirConta() {
    setErro("");
    setProcessando(true);
    try {
      const response = await fetch("/api/auth/account", { method: "DELETE" });
      const dados = (await response.json()) as { erro?: string };
      if (!response.ok) throw new Error(dados.erro || "Não foi possível excluir a conta.");
      onUsuarioAlterado(null);
      onFechar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível excluir a conta.");
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div className={modoPagina ? "w-full" : "fixed inset-0 z-50 flex items-center justify-center bg-night/75 p-4 backdrop-blur-sm"}>
      <div
        role={modoPagina ? "region" : "dialog"}
        aria-modal={modoPagina ? undefined : true}
        aria-labelledby="conta-titulo"
        className="mx-auto w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-float"
      >
        <div className="bg-gradient-to-br from-night to-slate-800 px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Conta ByteLab</p>
              <h2 id="conta-titulo" className="mt-1 text-xl font-extrabold">{usuario ? "Sua conta" : modoPagina ? "Entre para continuar" : "Acesse seus catálogos"}</h2>
            </div>
            {!modoPagina && <button type="button" onClick={onFechar} aria-label="Fechar" className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-xl hover:bg-white/20">×</button>}
          </div>
        </div>

        <div className="p-6">
          {configurado === false ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              <strong>Banco ainda não configurado.</strong> Siga o arquivo <code>MONGODB_SETUP.md</code>, crie o <code>.env.local</code> e reinicie o projeto.
            </div>
          ) : usuario ? (
            <div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-extrabold text-ink">{usuario.nome}</p>
                <p className="mt-1 text-sm text-slate-500">{usuario.email}</p>
              </div>
              <p className="mt-4 text-xs leading-5 text-slate-500">
                Apenas os catálogos que você salvar explicitamente são enviados ao banco. Senhas são derivadas com scrypt e o cookie de sessão não pode ser lido pelo JavaScript da página.
              </p>
              {erro && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
              <div className="mt-6 flex flex-wrap justify-between gap-2">
                {confirmarExclusao ? (
                  <div className="w-full rounded-2xl border border-red-200 bg-red-50 p-4">
                    <p className="text-sm font-bold text-red-800">Excluir permanentemente conta, sessões e catálogos salvos?</p>
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => setConfirmarExclusao(false)} className="button-secondary">Cancelar</button>
                      <button type="button" disabled={processando} onClick={excluirConta} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">Confirmar exclusão</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmarExclusao(true)} className="text-sm font-bold text-red-600 hover:text-red-700">Excluir minha conta e dados</button>
                )}
                {!confirmarExclusao && <button type="button" disabled={processando} onClick={sair} className="button-secondary">Sair</button>}
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
                {(["entrar", "criar"] as const).map((valor) => (
                  <button
                    type="button"
                    key={valor}
                    onClick={() => { setModo(valor); setErro(""); }}
                    className={`rounded-lg px-3 py-2 text-sm font-bold ${modo === valor ? "bg-white text-ink shadow-sm" : "text-slate-500"}`}
                  >
                    {valor === "entrar" ? "Entrar" : "Criar conta"}
                  </button>
                ))}
              </div>
              <form onSubmit={enviar} className="mt-5 space-y-4">
                {modo === "criar" && (
                  <label className="block text-sm font-bold text-slate-700">Nome
                    <input autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} className="field-control mt-2" maxLength={80} required />
                  </label>
                )}
                <label className="block text-sm font-bold text-slate-700">E-mail
                  <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field-control mt-2" maxLength={254} required />
                </label>
                <label className="block text-sm font-bold text-slate-700">Senha
                  <input type="password" autoComplete={modo === "entrar" ? "current-password" : "new-password"} value={senha} onChange={(e) => setSenha(e.target.value)} className="field-control mt-2" minLength={10} maxLength={128} required />
                  {modo === "criar" && <span className="mt-1 block text-xs font-normal text-slate-500">Use de 10 a 128 caracteres e uma senha exclusiva.</span>}
                </label>
                {modo === "criar" && (
                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                    <input type="checkbox" checked={aceitou} onChange={(e) => setAceitou(e.target.checked)} className="mt-1 accent-accent" required />
                    <span>Declaro que li o <a href="/privacidade" target="_blank" className="font-bold text-accentDark underline">aviso de privacidade</a> e estou ciente do tratamento necessário para criar e manter minha conta.</span>
                  </label>
                )}
                {erro && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
                <button type="submit" disabled={processando || configurado === null} className="button-primary w-full">
                  {processando ? "Aguarde…" : modo === "entrar" ? "Entrar" : "Criar conta"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
