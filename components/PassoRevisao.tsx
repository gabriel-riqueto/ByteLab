"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  agruparParaExibicao,
  atualizarDisponibilidadeImagem,
  confirmarValorManual,
  criarGrupoParaFilho,
  editarCampoFilho,
  editarClassificacaoGrupo,
  finalizarLinhas,
  moverParaGrupoExistente,
  prepararLinhasExportacao,
  renomearGrupo,
} from "@/lib/group";
import { chave, CORES_CANONICAS, DEPARTAMENTOS, TAMANHOS_CANONICOS, TIPOS_PRODUTO, normalizarTamanho } from "@/lib/dictionaries";
import { gerarArquivosAmazonPorTipo, gerarCsvSaida, FormatoSaida } from "@/lib/csv";
import { AVISO_MERCADO_LIVRE, gerarRascunhoMercadoLivre } from "@/lib/platforms/mercado-livre";
import { BatchSettings, ProcessedRow, UsuarioSessao, statusDaLinha } from "@/lib/types";
import { criarZip } from "@/lib/zip";
import StatusBadge from "./StatusBadge";
import ImagemMiniatura from "./ImagemMiniatura";

interface Props {
  linhas: ProcessedRow[];
  config: BatchSettings;
  nomeArquivo: string;
  onLinhasAtualizadas: (linhas: ProcessedRow[]) => void;
  onVoltar: () => void;
  focoLinhaId?: string | null;
  usuario: UsuarioSessao | null;
  onEntrar: () => void;
  onAbrirCatalogos: () => void;
}

const estiloInputPequeno =
  "w-full rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2 text-sm text-ink outline-none transition hover:border-slate-300 focus:border-accent focus:bg-white focus:ring-4 focus:ring-accent/10";

type FiltroStatus = "todos" | "bloqueado" | "aviso" | "ok";

function baixarBlob(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function baixarArquivo(conteudo: string, nomeArquivo: string, formato: FormatoSaida | "json") {
  const tipo = formato === "csv" ? "text/csv;charset=utf-8" : formato === "tsv" ? "text/tab-separated-values;charset=utf-8" : "application/json;charset=utf-8";
  baixarBlob(new Blob([conteudo], { type: tipo }), nomeArquivo);
}

function idLinha(id: string): string {
  return `linha-${encodeURIComponent(id)}`;
}

function nomeBaseSeguro(nomeArquivo: string): string {
  return (nomeArquivo || "catalogo")
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "catalogo";
}

export default function PassoRevisao({ linhas, config, nomeArquivo, onLinhasAtualizadas, onVoltar, focoLinhaId, usuario, onEntrar, onAbrirCatalogos }: Props) {
  const [formato, setFormato] = useState<FormatoSaida>("csv");
  const [mostrarResumo, setMostrarResumo] = useState(false);
  const [filtro, setFiltro] = useState<FiltroStatus>("todos");
  const [gruposRecolhidos, setGruposRecolhidos] = useState<Set<string>>(new Set());
  const [novoGrupo, setNovoGrupo] = useState<{ childId: string; nome: string } | null>(null);
  const historico = useRef<ProcessedRow[][]>([]);
  const [podeDesfazer, setPodeDesfazer] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mensagemSalvamento, setMensagemSalvamento] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  useEffect(() => {
    if (!focoLinhaId) return;
    const alvo = document.getElementById(idLinha(focoLinhaId));
    if (alvo) requestAnimationFrame(() => alvo.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [focoLinhaId]);

  const grupos = useMemo(() => agruparParaExibicao(linhas), [linhas]);
  const repeticoesOriginais = useMemo(() => {
    const cores = new Map<string, number>();
    const tamanhos = new Map<string, number>();
    for (const item of linhas) {
      if (item.tipo !== "child") continue;
      if (!CORES_CANONICAS.includes(item.cor) && !item.corConfirmadaManualmente) {
        const k = chave(item.corOriginal);
        cores.set(k, (cores.get(k) ?? 0) + 1);
      }
      if (!normalizarTamanho(item.tamanhoOriginal).reconhecida && !item.tamanhoConfirmadoManualmente) {
        const k = chave(item.tamanhoOriginal);
        tamanhos.set(k, (tamanhos.get(k) ?? 0) + 1);
      }
    }
    return { cores, tamanhos };
  }, [linhas]);
  const gruposVisiveis = useMemo(
    () =>
      grupos
        .map((grupo) => ({
          ...grupo,
          filhos: filtro === "todos" ? grupo.filhos : grupo.filhos.filter((filho) => statusDaLinha(filho) === filtro),
        }))
        .filter((grupo) => grupo.filhos.length > 0),
    [filtro, grupos]
  );

  const filhos = linhas.filter((l) => l.tipo === "child");
  const contagem = {
    total: filhos.length,
    ok: filhos.filter((f) => statusDaLinha(f) === "ok").length,
    aviso: filhos.filter((f) => statusDaLinha(f) === "aviso").length,
    bloqueado: filhos.filter((f) => statusDaLinha(f) === "bloqueado").length,
  };

  useEffect(() => {
    if (!mostrarResumo && !novoGrupo) return;
    function fecharComEsc(evento: KeyboardEvent) {
      if (evento.key !== "Escape") return;
      setMostrarResumo(false);
      setNovoGrupo(null);
    }
    window.addEventListener("keydown", fecharComEsc);
    return () => window.removeEventListener("keydown", fecharComEsc);
  }, [mostrarResumo, novoGrupo]);

  function atualizar(novasLinhas: ProcessedRow[], registrarHistorico = true) {
    if (registrarHistorico) {
      historico.current = [...historico.current.slice(-19), linhas];
      setPodeDesfazer(true);
    }
    onLinhasAtualizadas(finalizarLinhas(novasLinhas).linhas);
  }

  function desfazer() {
    const anterior = historico.current.at(-1);
    if (!anterior) return;
    historico.current = historico.current.slice(0, -1);
    setPodeDesfazer(historico.current.length > 0);
    onLinhasAtualizadas(anterior);
  }

  function handleEditarCampo(linha: ProcessedRow, campo: Parameters<typeof editarCampoFilho>[1], valor: string) {
    const valorAtual = {
      sku: linha.sku,
      cor: linha.corOriginal,
      tamanho: linha.tamanhoOriginal,
      preco: linha.preco,
      imagemUrl: linha.imagemUrl,
      quantidade: linha.quantidade,
      gtin: linha.gtin,
    }[campo];
    if (valor.trim() === valorAtual.trim()) return;
    atualizar(linhas.map((l) => (l.id === linha.id ? editarCampoFilho(l, campo, valor, config) : l)));
  }

  function handleConfirmarManual(linha: ProcessedRow, campo: "cor" | "tamanho", valor: string) {
    if (!valor) return;
    atualizar(linhas.map((l) => (l.id === linha.id ? confirmarValorManual(l, campo, valor, config) : l)));
  }

  function handleAplicarATodas(linha: ProcessedRow, campo: "cor" | "tamanho", valor: string) {
    if (!valor) return;
    const original = campo === "cor" ? linha.corOriginal : linha.tamanhoOriginal;
    atualizar(
      linhas.map((l) => {
        if (l.tipo !== "child") return l;
        const igual = campo === "cor" ? chave(l.corOriginal) === chave(original) : chave(l.tamanhoOriginal) === chave(original);
        return igual ? confirmarValorManual(l, campo, valor, config) : l;
      })
    );
  }

  function handleMoverGrupo(linha: ProcessedRow, skuPaiAlvo: string) {
    if (!skuPaiAlvo || skuPaiAlvo === linha.skuPai) return;
    atualizar(moverParaGrupoExistente(linhas, linha.id, skuPaiAlvo));
  }

  function handleRenomearGrupo(skuPai: string, novoNome: string) {
    if (!novoNome.trim()) return;
    const pai = linhas.find((linha) => linha.tipo === "parent" && linha.sku === skuPai);
    if (pai?.nomeBase === novoNome.trim()) return;
    atualizar(renomearGrupo(linhas, skuPai, novoNome));
  }

  function handleEditarClassificacao(
    skuPai: string,
    campo: "tipoProduto" | "departamento",
    valor: string
  ) {
    atualizar(editarClassificacaoGrupo(linhas, skuPai, campo, valor, config));
  }

  function handleDisponibilidadeImagem(linha: ProcessedRow, disponivel: boolean) {
    const atualizada = atualizarDisponibilidadeImagem(linha, disponivel);
    if (atualizada === linha) return;
    atualizar(linhas.map((item) => (item.id === linha.id ? atualizada : item)), false);
  }

  function handleCriarGrupo() {
    if (!novoGrupo?.nome.trim()) return;
    atualizar(criarGrupoParaFilho(linhas, novoGrupo.childId, novoGrupo.nome));
    setNovoGrupo(null);
  }

  function alternarGrupo(skuPai: string) {
    setGruposRecolhidos((atuais) => {
      const proximos = new Set(atuais);
      if (proximos.has(skuPai)) proximos.delete(skuPai);
      else proximos.add(skuPai);
      return proximos;
    });
  }

  function irParaProximoProblema() {
    const problema = filhos.find((filho) => statusDaLinha(filho) !== "ok");
    if (!problema) return;
    setFiltro("todos");
    setGruposRecolhidos((atuais) => {
      const proximos = new Set(atuais);
      proximos.delete(problema.skuPai);
      return proximos;
    });
    requestAnimationFrame(() => {
      document.getElementById(idLinha(problema.id))?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function linhasParaExportar(apenasValidas: boolean): ProcessedRow[] {
    return apenasValidas ? prepararLinhasExportacao(linhas) : linhas;
  }

  function confirmarExportacao() {
    if (contagem.ok + contagem.aviso === 0) return;
    const apenasValidas = contagem.bloqueado > 0;
    const exportaveis = linhasParaExportar(apenasValidas);
    if (config.plataforma === "mercado_livre") {
      const conteudo = gerarRascunhoMercadoLivre(exportaveis, config);
      baixarArquivo(conteudo, `${nomeBaseSeguro(nomeArquivo)}-bytelab-mercado-livre-rascunho.json`, "json");
    } else {
      const extensao = formato === "tsv" ? "txt" : "csv";
      const base = nomeBaseSeguro(nomeArquivo);
      const arquivos = gerarArquivosAmazonPorTipo(exportaveis, formato);
      if (arquivos.length > 1) {
        const zip = criarZip(
          arquivos.map((arquivo) => ({
            nome: `${base}-${arquivo.nomeSeguro}-amazon.${extensao}`,
            conteudo: arquivo.conteudo,
          }))
        );
        baixarBlob(zip, `${base}-bytelab-amazon-por-tipo.zip`);
      } else {
        const conteudo = arquivos[0]?.conteudo ?? gerarCsvSaida(exportaveis, formato);
        baixarArquivo(conteudo, `${base}-bytelab-amazon.${extensao}`, formato);
      }
    }
    setMostrarResumo(false);
  }

  async function salvarCatalogo() {
    if (!usuario) {
      onEntrar();
      return;
    }
    setSalvando(true);
    setMensagemSalvamento(null);
    try {
      const response = await fetch("/api/catalogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nomeBaseSeguro(nomeArquivo).replace(/-/g, " "),
          nomeArquivo,
          config,
          linhas,
        }),
      });
      const dados = (await response.json()) as { erro?: string };
      if (!response.ok) throw new Error(dados.erro || "Não foi possível salvar o catálogo.");
      setMensagemSalvamento({ tipo: "ok", texto: "Catálogo salvo na sua conta." });
    } catch (falha) {
      setMensagemSalvamento({ tipo: "erro", texto: falha instanceof Error ? falha.message : "Não foi possível salvar o catálogo." });
    } finally {
      setSalvando(false);
    }
  }

  const gruposDisponiveis = grupos.map((g) => ({ sku: g.pai.sku, nome: g.pai.nomeBase }));
  const gruposExportaveis = new Set(
    filhos.filter((filho) => statusDaLinha(filho) !== "bloqueado").map((filho) => filho.skuPai)
  ).size;
  const tiposExportaveis = new Set(
    filhos
      .filter((filho) => statusDaLinha(filho) !== "bloqueado")
      .map((filho) => filho.tipoProduto.trim())
      .filter(Boolean)
  ).size;
  const percentualOk = contagem.total > 0 ? Math.round((contagem.ok / contagem.total) * 100) : 0;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Passo 4 · Revisão</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Seu catálogo está quase pronto</h2>
          <p className="mt-2 text-base text-slate-600">
            Confira os alertas, ajuste as variações e exporte para {config.plataforma === "amazon" ? "a Amazon" : "o rascunho do Mercado Livre"}.
          </p>
        </div>
        <div className="min-w-56 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between gap-4 text-xs font-semibold text-slate-500">
            <span className="max-w-36 truncate" title={nomeArquivo}>{nomeArquivo || "Catálogo"}</span>
            <span className="text-accentDark">{percentualOk}% OK</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-gradient-to-r from-accent to-emerald-400 transition-all" style={{ width: `${percentualOk}%` }} />
          </div>
        </div>
      </div>

      <div className="panel mb-6 overflow-hidden rounded-3xl">
        <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0" aria-live="polite">
          <div className="p-4 sm:p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Grupos</p>
            <p className="mt-1 text-2xl font-extrabold text-ink">{grupos.length}</p>
          </div>
          <div className="p-4 sm:p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Variações</p>
            <p className="mt-1 text-2xl font-extrabold text-ink">{contagem.total}</p>
          </div>
          <div className="p-4 sm:p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">Prontas</p>
            <p className="mt-1 text-2xl font-extrabold text-emerald-700">{contagem.ok}</p>
          </div>
          <div className="p-4 sm:p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-600">Revisar</p>
            <p className="mt-1 text-2xl font-extrabold text-amber-700">{contagem.aviso}</p>
          </div>
          <div className="col-span-2 p-4 sm:col-span-1 sm:p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-red-500">Bloqueadas</p>
            <p className="mt-1 text-2xl font-extrabold text-red-600">{contagem.bloqueado}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 p-4">
          <div className="flex flex-wrap gap-2" aria-label="Filtrar por status">
            {([
              ["todos", `Todos (${contagem.total})`],
              ["bloqueado", `Bloqueados (${contagem.bloqueado})`],
              ["aviso", `Para revisar (${contagem.aviso})`],
              ["ok", `OK (${contagem.ok})`],
            ] as const).map(([valor, rotulo]) => (
              <button
                type="button"
                key={valor}
                aria-pressed={filtro === valor}
                onClick={() => setFiltro(valor)}
                className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                  filtro === valor
                    ? "bg-night text-white shadow-md"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-ink"
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!podeDesfazer} onClick={desfazer} className="button-secondary">
              ↶ Desfazer
            </button>
            {(contagem.aviso > 0 || contagem.bloqueado > 0) && (
              <button
                type="button"
                onClick={irParaProximoProblema}
                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-800 hover:bg-amber-100"
              >
                Próximo problema →
              </button>
            )}
            {config.plataforma === "amazon" && <select
              aria-label="Formato do arquivo"
              value={formato}
              onChange={(e) => setFormato(e.target.value as FormatoSaida)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 outline-none focus:border-accent focus:ring-4 focus:ring-accent/10"
            >
              <option value="csv">CSV (vírgula)</option>
              <option value="tsv">TSV / .txt</option>
            </select>}
            <button type="button" onClick={() => void salvarCatalogo()} disabled={salvando} className="button-secondary">
              {salvando ? "Salvando…" : usuario ? "Salvar na conta" : "Entrar para salvar"}
            </button>
            {usuario && <button type="button" onClick={onAbrirCatalogos} className="rounded-xl px-3 py-2.5 text-sm font-bold text-accentDark hover:bg-emerald-50">Meus catálogos</button>}
            <button onClick={() => setMostrarResumo(true)} className="button-primary">
              {config.plataforma === "amazon" ? "Exportar arquivo" : "Baixar rascunho JSON"}
            </button>
          </div>
        </div>
      </div>

      {mensagemSalvamento && (
        <div role="status" className={`mb-6 rounded-2xl border px-4 py-3 text-sm font-semibold ${mensagemSalvamento.tipo === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          {mensagemSalvamento.texto}
        </div>
      )}

      {config.plataforma === "mercado_livre" && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          <strong>Mercado Livre experimental.</strong> {AVISO_MERCADO_LIVRE}
        </div>
      )}

      <div className="space-y-6">
        {gruposVisiveis.map(({ pai, filhos: filhosDoGrupo }) => (
          <div key={pai.sku} className="panel overflow-hidden rounded-3xl">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-white via-white to-emerald-50/50 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  aria-label={gruposRecolhidos.has(pai.sku) ? "Expandir grupo" : "Recolher grupo"}
                  aria-expanded={!gruposRecolhidos.has(pai.sku)}
                  onClick={() => alternarGrupo(pai.sku)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-night text-lg font-bold text-white shadow-md hover:bg-slate-700"
                >
                  {gruposRecolhidos.has(pai.sku) ? "+" : "−"}
                </button>
                <input
                  key={`${pai.id}-${pai.nomeBase}`}
                  defaultValue={pai.nomeBase}
                  onBlur={(e) => handleRenomearGrupo(pai.sku, e.target.value)}
                  aria-label={`Nome do grupo ${pai.nomeBase}`}
                  className="min-w-0 max-w-sm rounded-xl border border-transparent bg-transparent px-2 py-1.5 text-base font-extrabold text-ink hover:border-slate-200 hover:bg-white focus:border-accent focus:bg-white focus:outline-none focus:ring-4 focus:ring-accent/10"
                />
                <StatusBadge
                  status={
                    filhosDoGrupo.some((filho) => statusDaLinha(filho) === "bloqueado")
                      ? "bloqueado"
                      : filhosDoGrupo.some((filho) => statusDaLinha(filho) === "aviso")
                        ? "aviso"
                        : "ok"
                  }
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">SKU pai: {pai.sku}</span>
                <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">Tema: {pai.temaVariacao}</span>
                <span className="rounded-lg bg-emerald-100 px-2.5 py-1.5 text-emerald-800">
                  {filhosDoGrupo.length} variação(ões)
                </span>
              </div>
            </div>

            {config.plataforma === "amazon" && (
              <div className="grid gap-4 border-t border-slate-100 bg-slate-50/70 px-5 py-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Tipo de produto desta família</span>
                  <select
                    aria-label={`Tipo de produto do grupo ${pai.nomeBase}`}
                    value={pai.tipoProduto}
                    onChange={(e) => handleEditarClassificacao(pai.sku, "tipoProduto", e.target.value)}
                    className={`${estiloInputPequeno} mt-2`}
                  >
                    <option value="">Selecione…</option>
                    {pai.tipoProduto && !TIPOS_PRODUTO.some((tipo) => tipo.valor === pai.tipoProduto) && (
                      <option value={pai.tipoProduto}>{pai.tipoProduto} (informado)</option>
                    )}
                    {TIPOS_PRODUTO.map((tipo) => (
                      <option key={tipo.valor} value={tipo.valor}>{tipo.rotulo}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Departamento desta família</span>
                  <select
                    aria-label={`Departamento do grupo ${pai.nomeBase}`}
                    value={pai.departamento}
                    onChange={(e) => handleEditarClassificacao(pai.sku, "departamento", e.target.value)}
                    className={`${estiloInputPequeno} mt-2`}
                  >
                    <option value="">Selecione…</option>
                    {pai.departamento && !DEPARTAMENTOS.some((departamento) => departamento.valor === pai.departamento) && (
                      <option value={pai.departamento}>{pai.departamento} (não reconhecido)</option>
                    )}
                    {DEPARTAMENTOS.map((departamento) => (
                      <option key={departamento.valor} value={departamento.valor}>{departamento.rotulo}</option>
                    ))}
                  </select>
                </label>

                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-600">
                    Tipo: {pai.tipoProdutoOrigem === "detectado" ? "detectado" : pai.tipoProdutoOrigem === "planilha" ? "da planilha" : pai.tipoProdutoOrigem === "manual" ? "revisado" : "padrão"}
                  </span>
                  {pai.tipoProdutoOrigem === "detectado" && !pai.tipoProdutoConfirmado && pai.tipoProduto && (
                    <button
                      type="button"
                      onClick={() => handleEditarClassificacao(pai.sku, "tipoProduto", pai.tipoProduto)}
                      className="rounded-xl bg-amber-100 px-3 py-2 text-xs font-extrabold text-amber-900 hover:bg-amber-200"
                    >
                      Confirmar tipo
                    </button>
                  )}
                </div>
              </div>
            )}

            {!gruposRecolhidos.has(pai.sku) && <div className="overflow-x-auto border-t border-slate-100">
              <table className="w-full min-w-[1320px] text-left text-sm">
                <caption className="sr-only">Variações do grupo {pai.nomeBase}</caption>
                <thead className="bg-slate-50/95">
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3 font-bold">Foto e URL (opcional)</th>
                    <th className="px-4 py-3 font-bold">SKU</th>
                    <th className="px-4 py-3 font-bold">Cor</th>
                    <th className="px-4 py-3 font-bold">Tamanho</th>
                    <th className="px-4 py-3 font-bold">Preço</th>
                    <th className="px-4 py-3 font-bold">Qtd.</th>
                    <th className="px-4 py-3 font-bold">GTIN</th>
                    <th className="px-4 py-3 font-bold">Grupo</th>
                  </tr>
                </thead>
                <tbody>
                  {filhosDoGrupo.map((filho) => {
                    const status = statusDaLinha(filho);
                    const corReconhecida = filho.corConfirmadaManualmente || CORES_CANONICAS.includes(filho.cor);
                    const tamanhoReconhecido =
                      filho.tamanhoConfirmadoManualmente || normalizarTamanho(filho.tamanhoOriginal).reconhecida;
                    const outrosComMesmaCor = repeticoesOriginais.cores.get(chave(filho.corOriginal)) ?? 0;
                    const outrosComMesmoTamanho = repeticoesOriginais.tamanhos.get(chave(filho.tamanhoOriginal)) ?? 0;

                    return (
                      <tr id={idLinha(filho.id)} key={filho.id} className="scroll-mt-6 border-b border-slate-100 align-top transition-colors last:border-0 hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <StatusBadge status={status} />
                          {filho.issues.length > 0 && (
                            <ul className="mt-2 max-w-64 space-y-1.5 text-xs leading-snug">
                              {filho.issues.map((i, idx) => (
                                <li
                                  key={`${i.codigo ?? i.campo}-${idx}`}
                                  className={`rounded-lg px-2 py-1.5 ${
                                    i.severidade === "erro" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"
                                  }`}
                                >
                                  {i.mensagem}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex min-w-72 items-start gap-3">
                            <ImagemMiniatura
                              url={filho.imagemUrl}
                              onDisponibilidade={(disponivel) => handleDisponibilidadeImagem(filho, disponivel)}
                            />
                            <input
                              key={`${filho.id}-imagem-${filho.imagemUrl}`}
                              aria-label={`URL da imagem do SKU ${filho.sku}`}
                              defaultValue={filho.imagemUrl}
                              placeholder="URL da imagem (opcional)"
                              onBlur={(e) => handleEditarCampo(filho, "imagemUrl", e.target.value)}
                              className={estiloInputPequeno}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            key={`${filho.id}-sku-${filho.sku}`}
                            defaultValue={filho.sku}
                            onBlur={(e) => handleEditarCampo(filho, "sku", e.target.value)}
                            className={estiloInputPequeno}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-2">
                            <span className="text-xs font-semibold text-slate-400">Original: {filho.corOriginal || "—"}</span>
                            <input
                              key={`${filho.id}-cor-${filho.corOriginal}`}
                              defaultValue={filho.corOriginal}
                              onBlur={(e) => handleEditarCampo(filho, "cor", e.target.value)}
                              className={estiloInputPequeno}
                            />
                            {!corReconhecida ? (
                              <select
                                defaultValue=""
                                onChange={(e) => handleConfirmarManual(filho, "cor", e.target.value)}
                                className={`${estiloInputPequeno} border-amber-300 bg-amber-50`}
                              >
                                <option value="">Selecionar cor equivalente…</option>
                                {CORES_CANONICAS.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="w-fit rounded-lg bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800">Padrão: {filho.cor}</span>
                            )}
                            {filho.corConfirmadaManualmente && outrosComMesmaCor > 0 && (
                              <button
                                onClick={() => handleAplicarATodas(filho, "cor", filho.cor)}
                                className="text-left text-xs font-bold text-accentDark hover:text-accent"
                              >
                                Aplicar a mais {outrosComMesmaCor} linha(s) iguais
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-2">
                            <span className="text-xs font-semibold text-slate-400">Original: {filho.tamanhoOriginal || "—"}</span>
                            <input
                              key={`${filho.id}-tamanho-${filho.tamanhoOriginal}`}
                              defaultValue={filho.tamanhoOriginal}
                              onBlur={(e) => handleEditarCampo(filho, "tamanho", e.target.value)}
                              className={estiloInputPequeno}
                            />
                            {!tamanhoReconhecido ? (
                              <select
                                defaultValue=""
                                onChange={(e) => handleConfirmarManual(filho, "tamanho", e.target.value)}
                                className={`${estiloInputPequeno} border-amber-300 bg-amber-50`}
                              >
                                <option value="">Selecionar tamanho equivalente…</option>
                                {TAMANHOS_CANONICOS.map((t) => (
                                  <option key={t} value={t}>
                                    {t}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="w-fit rounded-lg bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800">Padrão: {filho.tamanho}</span>
                            )}
                            {filho.tamanhoConfirmadoManualmente && outrosComMesmoTamanho > 0 && (
                              <button
                                onClick={() => handleAplicarATodas(filho, "tamanho", filho.tamanho)}
                                className="text-left text-xs font-bold text-accentDark hover:text-accent"
                              >
                                Aplicar a mais {outrosComMesmoTamanho} linha(s) iguais
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            key={`${filho.id}-preco-${filho.preco}`}
                            defaultValue={filho.precoOriginal ?? filho.preco}
                            onBlur={(e) => handleEditarCampo(filho, "preco", e.target.value)}
                            className={estiloInputPequeno}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            key={`${filho.id}-quantidade-${filho.quantidade}`}
                            inputMode="numeric"
                            defaultValue={filho.quantidade}
                            onBlur={(e) => handleEditarCampo(filho, "quantidade", e.target.value)}
                            className={`${estiloInputPequeno} w-16`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            key={`${filho.id}-gtin-${filho.gtin}`}
                            defaultValue={filho.gtin}
                            placeholder="opcional"
                            onBlur={(e) => handleEditarCampo(filho, "gtin", e.target.value)}
                            className={estiloInputPequeno}
                          />
                          {filho.gtinTipo && <span className="mt-2 inline-flex rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{filho.gtinTipo}</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="min-w-44 space-y-2">
                            <select
                              aria-label={`Grupo do SKU ${filho.sku}`}
                              value={filho.skuPai}
                              onChange={(e) => handleMoverGrupo(filho, e.target.value)}
                              className={estiloInputPequeno}
                            >
                              {gruposDisponiveis.map((g) => (
                                <option key={g.sku} value={g.sku}>
                                  {g.nome}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => setNovoGrupo({ childId: filho.id, nome: `${filho.nomeBase} 2` })}
                              className="text-left text-xs font-bold text-accentDark hover:text-accent"
                            >
                              Separar em novo grupo
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>}
          </div>
        ))}
        {gruposVisiveis.length === 0 && (
          <div className="panel rounded-3xl p-10 text-center text-sm text-slate-500">
            Nenhuma variação corresponde a este filtro.
          </div>
        )}
      </div>

      <div className="mt-6">
        <button onClick={onVoltar} className="button-secondary">
          ← Ver validação atualizada
        </button>
      </div>

      {novoGrupo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-night/75 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="novo-grupo-titulo"
            className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-float"
          >
            <div className="bg-gradient-to-br from-night to-slate-800 px-6 py-5 text-white">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/20 text-xl font-bold text-emerald-300">
                  +
                </span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Organizar catálogo</p>
                  <h2 id="novo-grupo-titulo" className="mt-1 text-xl font-extrabold">Separar em novo grupo</h2>
                </div>
              </div>
            </div>
            <div className="p-6">
              <p className="text-sm leading-6 text-slate-600">
                Dê um nome ao novo produto pai. A variação selecionada será movida e receberá um novo SKU pai.
              </p>
              <label className="mt-5 block text-sm font-bold text-ink">
                Nome do produto pai
                <input
                  autoFocus
                  value={novoGrupo.nome}
                  onChange={(e) => setNovoGrupo({ ...novoGrupo, nome: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCriarGrupo();
                  }}
                  className="field-control mt-2"
                />
              </label>
              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => setNovoGrupo(null)} className="button-secondary">
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!novoGrupo.nome.trim()}
                  onClick={handleCriarGrupo}
                  className="button-primary"
                >
                  Criar grupo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {mostrarResumo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-night/75 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="exportacao-titulo"
            className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-float"
          >
            <div className="bg-gradient-to-br from-night via-slate-900 to-emerald-950 px-6 py-6 text-white">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/20 text-emerald-300">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2">
                    <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
                  </svg>
                </span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Última conferência</p>
                  <h2 id="exportacao-titulo" className="mt-1 text-xl font-extrabold">Confirmar exportação</h2>
                </div>
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Produtos</p>
                  <p className="mt-1 text-2xl font-extrabold text-ink">{gruposExportaveis}</p>
                  <p className="mt-1 text-xs text-slate-500">grupos pai/filho</p>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Variações</p>
                  <p className="mt-1 text-2xl font-extrabold text-emerald-800">{contagem.ok + contagem.aviso}</p>
                  <p className="mt-1 text-xs text-emerald-700">serão exportadas</p>
                </div>
              </div>
              {contagem.bloqueado > 0 && (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                  <strong>{contagem.bloqueado} variação(ões) bloqueada(s)</strong> ficará(ão) de fora. Corrija ou remova
                  antes de reexportar.
                </div>
              )}
              <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm">
                <span className="font-semibold text-slate-500">Formato do arquivo</span>
                <span className="font-bold text-ink">
                  {config.plataforma === "mercado_livre"
                    ? "JSON (rascunho)"
                    : tiposExportaveis > 1
                      ? `ZIP · ${tiposExportaveis} arquivos ${formato.toUpperCase()}`
                      : formato === "tsv" ? "TSV (.txt)" : "CSV (vírgula)"}
                </span>
              </div>
              {config.plataforma === "mercado_livre" ? (
                <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{AVISO_MERCADO_LIVRE} O ByteLab não enviará nada à plataforma.</p>
              ) : (
                <p className="mt-4 text-xs leading-5 text-slate-500">
                  {tiposExportaveis > 1
                    ? `O ByteLab separará as famílias em ${tiposExportaveis} arquivos, um por tipo de produto. `
                    : "O arquivo cobre os campos principais do tipo de produto. "}
                  Antes do envio final, transfira e confira cada resultado no modelo oficial da categoria no Seller
                  Central, pois atributos obrigatórios variam por subcategoria.
                </p>
              )}
              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => setMostrarResumo(false)} className="button-secondary">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmarExportacao}
                  disabled={contagem.ok + contagem.aviso === 0}
                  className="button-primary"
                >
                  {config.plataforma === "amazon" && tiposExportaveis > 1 ? "Confirmar e baixar ZIP" : "Confirmar e baixar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
