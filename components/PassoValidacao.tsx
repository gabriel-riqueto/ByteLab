"use client";

import { useMemo, useState } from "react";
import { resumirValidacao } from "@/lib/validation-summary";
import { BatchSettings, ProcessedRow } from "@/lib/types";

interface Props {
  linhas: ProcessedRow[];
  config: BatchSettings;
  onVoltar: () => void;
  onContinuar: (linhaId?: string) => void;
}

const POR_PAGINA = 50;

export default function PassoValidacao({ linhas, config, onVoltar, onContinuar }: Props) {
  const resumo = useMemo(() => resumirValidacao(linhas), [linhas]);
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<string | null>(null);
  const [limite, setLimite] = useState(POR_PAGINA);
  const selecionada = resumo.categorias.find((item) => item.id === categoriaSelecionada);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Passo 3 · Validação</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Validação concluída</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Conferimos os produtos depois da normalização. Erros críticos impedem a exportação da variação afetada; alertas pedem revisão.
          </p>
        </div>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-extrabold uppercase tracking-widest text-accentDark">
          {config.plataforma === "amazon" ? "Amazon" : "Mercado Livre · rascunho"}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3" aria-live="polite">
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <p className="text-sm font-bold text-emerald-800">SKUs lidos</p>
          <p className="mt-2 text-4xl font-extrabold text-emerald-900">{resumo.skusLidos}</p>
          <p className="mt-2 text-xs text-emerald-800">Linhas de produto, inclusive com SKU vazio.</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-600">Alertas</p>
          <p className="mt-2 text-4xl font-extrabold text-ink">{resumo.alertas}</p>
          <p className="mt-2 text-xs text-slate-500">Ocorrências que exigem conferência.</p>
        </div>
        <div className="rounded-3xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <p className="text-sm font-bold text-red-700">Erros críticos</p>
          <p className="mt-2 text-4xl font-extrabold text-red-700">{resumo.errosCriticos}</p>
          <p className="mt-2 text-xs text-red-700">Ocorrências que bloqueiam a variação.</p>
        </div>
      </div>

      <div className="panel mt-6 overflow-hidden rounded-3xl">
        <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
          <h3 className="text-lg font-extrabold text-ink">Problemas encontrados</h3>
          <p className="mt-1 text-sm text-slate-500">Selecione um tipo para identificar as linhas originais e os valores encontrados.</p>
        </div>
        {resumo.categorias.length ? (
          <div className="divide-y divide-slate-100">
            {resumo.categorias.map((categoria) => (
              <button
                key={categoria.id}
                type="button"
                aria-expanded={categoriaSelecionada === categoria.id}
                onClick={() => { setCategoriaSelecionada(categoriaSelecionada === categoria.id ? null : categoria.id); setLimite(POR_PAGINA); }}
                className={`flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-slate-50 sm:px-6 ${categoriaSelecionada === categoria.id ? "bg-emerald-50/50" : ""}`}
              >
                <span className="flex min-w-0 items-center gap-3 text-sm font-bold text-ink">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${categoria.severidade === "erro" ? "bg-red-500" : "bg-amber-400"}`} />
                  {categoria.rotulo}
                </span>
                <span className="flex items-center gap-3 text-sm">
                  <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-extrabold text-ink">{categoria.problemas.length}</span>
                  <span className={`font-bold ${categoria.severidade === "erro" ? "text-red-700" : "text-amber-700"}`}>
                    {categoria.severidade === "erro" ? "Corrigir" : "Revisar"} {categoriaSelecionada === categoria.id ? "↑" : "↓"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="p-6 text-sm text-emerald-800">Nenhum problema encontrado pelas regras disponíveis neste MVP.</p>
        )}
      </div>

      {selecionada && (
        <section className="panel mt-5 overflow-hidden rounded-3xl" aria-label={`Produtos: ${selecionada.rotulo}`}>
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 sm:px-6">
            <h3 className="font-extrabold text-ink">{selecionada.rotulo} · {selecionada.problemas.length} ocorrência(s)</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {selecionada.problemas.slice(0, limite).map((problema) => (
              <div key={problema.id} className="grid gap-2 p-5 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
                <div className="min-w-0 space-y-1 break-words text-slate-600">
                  <p className="font-bold text-ink">Linha {problema.linhaOrigem ?? "—"} · SKU {problema.sku || "(vazio)"} · {problema.produto || "Produto sem nome"}</p>
                  <p><span className="font-bold">Campo:</span> {problema.campo} · <span className="font-bold">Valor:</span> “{problema.valorEncontrado || "(vazio)"}”</p>
                  <p>{problema.issue.mensagem}</p>
                </div>
                <button type="button" className="button-secondary justify-self-start" onClick={() => onContinuar(problema.linhaId)}>
                  {problema.issue.severidade === "erro" ? "Corrigir produto →" : "Revisar produto →"}
                </button>
              </div>
            ))}
          </div>
          {selecionada.problemas.length > limite && (
            <button type="button" onClick={() => setLimite(limite + POR_PAGINA)} className="m-5 text-sm font-bold text-accentDark hover:underline">
              Mostrar mais {Math.min(POR_PAGINA, selecionada.problemas.length - limite)} linha(s)
            </button>
          )}
        </section>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onVoltar} className="button-secondary">← Voltar às configurações</button>
        <button type="button" onClick={() => onContinuar()} className="button-primary">Revisar e preparar exportação →</button>
      </div>
    </div>
  );
}
