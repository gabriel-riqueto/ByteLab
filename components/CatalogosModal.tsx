"use client";

import { useCallback, useEffect, useState } from "react";
import { CatalogoSalvo, CatalogoSalvoResumo } from "@/lib/types";

interface Props {
  onFechar: () => void;
  onCarregar: (catalogo: CatalogoSalvo) => void;
}

export default function CatalogosModal({ onFechar, onCarregar }: Props) {
  const [catalogos, setCatalogos] = useState<CatalogoSalvoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);

  const listar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const response = await fetch("/api/catalogs");
      const dados = (await response.json()) as { catalogs?: CatalogoSalvoResumo[]; erro?: string };
      if (!response.ok) throw new Error(dados.erro || "Não foi possível listar os catálogos.");
      setCatalogos(dados.catalogs ?? []);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível listar os catálogos.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void listar(); }, [listar]);

  async function carregar(id: string) {
    setErro("");
    setCarregando(true);
    try {
      const response = await fetch(`/api/catalogs/${id}`);
      const dados = (await response.json()) as { catalog?: CatalogoSalvo; erro?: string };
      if (!response.ok || !dados.catalog) throw new Error(dados.erro || "Não foi possível abrir o catálogo.");
      onCarregar(dados.catalog);
      onFechar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível abrir o catálogo.");
      setCarregando(false);
    }
  }

  async function excluir(id: string) {
    setExcluindo(id);
    setErro("");
    try {
      const response = await fetch(`/api/catalogs/${id}`, { method: "DELETE" });
      const dados = (await response.json()) as { erro?: string };
      if (!response.ok) throw new Error(dados.erro || "Não foi possível excluir o catálogo.");
      setCatalogos((atuais) => atuais.filter((catalogo) => catalogo.id !== id));
      setConfirmar(null);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível excluir o catálogo.");
    } finally {
      setExcluindo(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-night/75 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="catalogos-titulo" className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-float">
        <div className="flex items-start justify-between gap-4 bg-gradient-to-br from-night to-slate-800 px-6 py-5 text-white">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Armazenamento pessoal</p>
            <h2 id="catalogos-titulo" className="mt-1 text-xl font-extrabold">Meus catálogos</h2>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-xl hover:bg-white/20">×</button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-6">
          <p className="mb-4 text-sm leading-6 text-slate-500">Somente os catálogos salvos por você aparecem aqui. O CSV original não é armazenado.</p>
          {erro && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
          {carregando ? (
            <p className="py-8 text-center text-sm text-slate-500">Carregando…</p>
          ) : catalogos.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">Nenhum catálogo salvo ainda.</div>
          ) : (
            <ul className="space-y-3">
              {catalogos.map((catalogo) => (
                <li key={catalogo.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-extrabold text-ink">{catalogo.nome}</p>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${catalogo.plataforma === "amazon" ? "bg-orange-50 text-orange-700" : "bg-yellow-100 text-yellow-800"}`}>
                          {catalogo.plataforma === "amazon" ? "Amazon" : "Mercado Livre · rascunho"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{catalogo.totalVariacoes} variação(ões) · atualizado em {new Date(catalogo.atualizadoEm).toLocaleDateString("pt-BR")}</p>
                    </div>
                    <div className="flex gap-2">
                      {confirmar === catalogo.id ? (
                        <>
                          <button type="button" onClick={() => setConfirmar(null)} className="button-secondary">Cancelar</button>
                          <button type="button" disabled={excluindo === catalogo.id} onClick={() => void excluir(catalogo.id)} className="rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Excluir mesmo</button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => setConfirmar(catalogo.id)} className="rounded-xl px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50">Excluir</button>
                          <button type="button" onClick={() => void carregar(catalogo.id)} className="button-primary">Abrir</button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
