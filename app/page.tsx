"use client";

import { useEffect, useRef, useState } from "react";
import PassoUpload from "@/components/PassoUpload";
import PassoConfiguracao from "@/components/PassoConfiguracao";
import PassoValidacao from "@/components/PassoValidacao";
import PassoRevisao from "@/components/PassoRevisao";
import ContaModal from "@/components/ContaModal";
import CatalogosModal from "@/components/CatalogosModal";
import { atualizarValidacaoImagemOpcional, processarLinhas } from "@/lib/group";
import { BatchSettings, CatalogoSalvo, InputRow, ProcessedRow, UsuarioSessao } from "@/lib/types";

type Etapa = "upload" | "configurar" | "validar" | "revisar";

const ETAPAS: { id: Etapa; titulo: string; descricao: string }[] = [
  { id: "upload", titulo: "Importar", descricao: "Escolha seu CSV" },
  { id: "configurar", titulo: "Configurar", descricao: "Defina o lote" },
  { id: "validar", titulo: "Validar", descricao: "Analise os problemas" },
  { id: "revisar", titulo: "Revisar", descricao: "Corrija e exporte" },
];

const CONFIG_PADRAO: BatchSettings = {
  plataforma: "amazon",
  marca: "",
  departamento: "",
  tipoProduto: "",
  quantidadePadrao: 10,
  generoAlvo: "",
  faixaEtaria: "",
  sistemaTamanho: "BR",
  semGtinComIsencao: false,
  mlCategoriaId: "",
  mlCondicao: "new",
  mlTipoAnuncio: "gold_special",
};

const CHAVE_ARMAZENAMENTO_LEGADO = "bytelab-sessao-v1";
const CHAVE_PREFERENCIAS = "bytelab-preferencias-v1";
const PRAZO_SESSAO_MS = 7 * 24 * 60 * 60 * 1000;

interface SessaoSalva {
  versao: 4 | 5;
  userId: string;
  salvoEm: number;
  etapa: Etapa;
  entradas: InputRow[] | null;
  config: BatchSettings;
  linhas: ProcessedRow[] | null;
  nomeArquivo: string;
}

function chaveArmazenamento(userId: string): string {
  return `bytelab-sessao-v5:${userId}`;
}

function chaveAnterior(userId: string): string {
  return `bytelab-sessao-v4:${userId}`;
}

function apagarProgressoLocal(userId: string) {
  localStorage.removeItem(chaveArmazenamento(userId));
  localStorage.removeItem(chaveAnterior(userId));
}

function normalizarConfig(valor?: Partial<BatchSettings> | null): BatchSettings {
  return { ...CONFIG_PADRAO, ...(valor ?? {}) };
}

function reconstruirEntradas(linhas: ProcessedRow[]): InputRow[] {
  return linhas.filter((linha) => linha.tipo === "child").map((linha, indice) => ({
    linha: linha.linhaOrigem ?? indice + 2,
    sku: linha.sku,
    nome: linha.nomeBase,
    grupo: linha.skuPai,
    tipoProduto: linha.tipoProduto,
    departamento: linha.departamento,
    preco: linha.preco,
    cor: linha.corOriginal || linha.cor,
    tamanho: linha.tamanhoOriginal || linha.tamanho,
    imagemUrl: linha.imagemUrl,
    gtin: linha.gtin,
    quantidade: linha.quantidadeOriginal,
  }));
}

export default function Home() {
  const [etapa, setEtapa] = useState<Etapa>("upload");
  const [entradas, setEntradas] = useState<InputRow[] | null>(null);
  const [config, setConfig] = useState<BatchSettings>(CONFIG_PADRAO);
  const [linhas, setLinhas] = useState<ProcessedRow[] | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [focoLinhaId, setFocoLinhaId] = useState<string | null>(null);
  const [salvarSessao, setSalvarSessao] = useState(false);
  const [restaurado, setRestaurado] = useState(false);
  const [armazenamentoPronto, setArmazenamentoPronto] = useState(false);
  const hidratado = useRef<string | null>(null);
  const [usuario, setUsuario] = useState<UsuarioSessao | null>(null);
  const [mongoConfigurado, setMongoConfigurado] = useState<boolean | null>(null);
  const [mostrarConta, setMostrarConta] = useState(false);
  const [mostrarCatalogos, setMostrarCatalogos] = useState(false);

  useEffect(() => {
    let ativo = true;
    fetch("/api/auth/status")
      .then(async (response) => {
        const dados = (await response.json()) as { configured?: boolean; user?: UsuarioSessao | null };
        if (!ativo) return;
        setMongoConfigurado(dados.configured === true);
        setUsuario(dados.user ?? null);
      })
      .catch(() => {
        if (ativo) setMongoConfigurado(false);
      });
    return () => { ativo = false; };
  }, []);

  useEffect(() => {
    if (!usuario) {
      hidratado.current = null;
      setArmazenamentoPronto(false);
      return;
    }
    if (hidratado.current === usuario.id) return;
    setArmazenamentoPronto(false);
    try {
      localStorage.removeItem(CHAVE_ARMAZENAMENTO_LEGADO);
      const preferencia = JSON.parse(localStorage.getItem(CHAVE_PREFERENCIAS) ?? "false") === true;
      setSalvarSessao(preferencia);
      const chaveUsuario = chaveArmazenamento(usuario.id);
      const bruto = preferencia ? (localStorage.getItem(chaveUsuario) ?? localStorage.getItem(chaveAnterior(usuario.id))) : null;
      if (bruto && preferencia) {
        const sessao: SessaoSalva = JSON.parse(bruto);
        const dentroDoPrazo = (sessao.versao === 5 || sessao.versao === 4) && sessao.userId === usuario.id && Date.now() - sessao.salvoEm <= PRAZO_SESSAO_MS;
        if (sessao.entradas && dentroDoPrazo) {
          setEtapa(sessao.versao === 4 && sessao.etapa === "revisar" ? "validar" : sessao.etapa);
          setEntradas(sessao.entradas.map((linha) => ({ ...linha, tipoProduto: linha.tipoProduto ?? "", departamento: linha.departamento ?? "" })));
          setConfig(normalizarConfig(sessao.config));
          setLinhas(sessao.linhas ? atualizarValidacaoImagemOpcional(sessao.linhas) : null);
          setNomeArquivo(sessao.nomeArquivo ?? "");
          setRestaurado(true);
          if (sessao.versao === 4) {
            const migrada: SessaoSalva = {
              ...sessao,
              versao: 5,
              etapa: sessao.etapa === "revisar" ? "validar" : sessao.etapa,
              entradas: sessao.entradas.map((linha) => ({ ...linha, tipoProduto: linha.tipoProduto ?? "", departamento: linha.departamento ?? "" })),
            };
            localStorage.setItem(chaveUsuario, JSON.stringify(migrada));
            localStorage.removeItem(chaveAnterior(usuario.id));
          }
        } else {
          apagarProgressoLocal(usuario.id);
        }
      } else if (!preferencia) {
        apagarProgressoLocal(usuario.id);
      }
    } catch {
      // sessão corrompida — ignora e começa do zero
    } finally {
      hidratado.current = usuario.id;
      setArmazenamentoPronto(true);
    }
  }, [usuario]);

  useEffect(() => {
    if (!usuario || hidratado.current !== usuario.id || !armazenamentoPronto) return;
    try {
      localStorage.setItem(CHAVE_PREFERENCIAS, JSON.stringify(salvarSessao));
      if (salvarSessao && entradas) {
        const sessao: SessaoSalva = {
          versao: 5,
          userId: usuario.id,
          salvoEm: Date.now(),
          etapa,
          entradas,
          config,
          linhas,
          nomeArquivo,
        };
        localStorage.setItem(chaveArmazenamento(usuario.id), JSON.stringify(sessao));
      } else {
        apagarProgressoLocal(usuario.id);
      }
    } catch {
      // armazenamento indisponível (modo privado, cota excedida) — segue sem persistir
    }
  }, [armazenamentoPronto, etapa, entradas, config, linhas, nomeArquivo, salvarSessao, usuario]);

  function comecarDoZero() {
    if (usuario) apagarProgressoLocal(usuario.id);
    setEtapa("upload");
    setEntradas(null);
    setConfig(CONFIG_PADRAO);
    setLinhas(null);
    setNomeArquivo("");
    setFocoLinhaId(null);
    setRestaurado(false);
  }

  function alterarPersistencia(salvar: boolean) {
    setSalvarSessao(salvar);
    if (!salvar) {
      try {
        if (usuario) apagarProgressoLocal(usuario.id);
      } catch {
        // armazenamento indisponível — o estado atual continua apenas em memória
      }
      setRestaurado(false);
    }
  }

  const indiceEtapa = ETAPAS.findIndex((item) => item.id === etapa);

  function carregarCatalogo(catalogo: CatalogoSalvo) {
    const configNormalizada = normalizarConfig(catalogo.config);
    setConfig(configNormalizada);
    setLinhas(atualizarValidacaoImagemOpcional(catalogo.linhas));
    setEntradas(reconstruirEntradas(catalogo.linhas));
    setNomeArquivo(catalogo.nomeArquivo || `${catalogo.nome}.csv`);
    setFocoLinhaId(null);
    setEtapa("validar");
    setRestaurado(false);
  }

  function alterarUsuario(novoUsuario: UsuarioSessao | null) {
    if (!novoUsuario && usuario) {
      try {
        apagarProgressoLocal(usuario.id);
      } catch {
        // segue com a saída mesmo se o armazenamento local estiver indisponível
      }
      hidratado.current = null;
      setArmazenamentoPronto(false);
      setEtapa("upload");
      setEntradas(null);
      setConfig(CONFIG_PADRAO);
      setLinhas(null);
      setNomeArquivo("");
      setFocoLinhaId(null);
      setRestaurado(false);
      setMostrarCatalogos(false);
    }
    setUsuario(novoUsuario);
    if (novoUsuario) setMongoConfigurado(true);
  }

  if (mongoConfigurado === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-night px-4 text-white">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-300 to-accent text-2xl font-black text-night shadow-glow">B</div>
          <p className="mt-4 text-sm font-semibold text-slate-300">Verificando sua sessão…</p>
        </div>
      </main>
    );
  }

  if (!usuario) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-night px-4 py-8 text-white sm:px-6">
        <div className="absolute -right-24 -top-32 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute -bottom-36 -left-20 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl items-center gap-10 lg:grid-cols-[1fr_28rem]">
          <section className="max-w-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-300 to-accent text-xl font-black text-night shadow-glow">B</div>
              <div>
                <p className="text-2xl font-extrabold tracking-tight">ByteLab</p>
                <p className="text-sm font-semibold text-emerald-300">Automação de catálogos</p>
              </div>
            </div>
            <h1 className="mt-8 text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">Organize seus produtos antes de publicar.</h1>
            <p className="mt-4 max-w-lg text-base leading-7 text-slate-300">Entre ou crie uma conta para importar, validar e salvar seus catálogos com segurança.</p>
          </section>
          <ContaModal
            modoPagina
            configurado={mongoConfigurado}
            usuario={null}
            onFechar={() => undefined}
            onUsuarioAlterado={alterarUsuario}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-16">
      <header className="relative overflow-hidden bg-night text-white shadow-float">
        <div className="absolute -right-20 -top-32 h-80 w-80 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute -bottom-44 left-1/4 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-4 pb-6 pt-6 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-300 to-accent text-xl font-black text-night shadow-glow">
                B
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">ByteLab</h1>
                  <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-200">
                    Catálogo
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-slate-300">
                  Prepare catálogos para diferentes marketplaces.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-3 py-2 text-xs text-slate-300 sm:flex">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
                Processamento local e privado
              </div>
              {entradas && (
                <button
                  onClick={comecarDoZero}
                  className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2 text-xs font-semibold text-slate-300 hover:border-white/20 hover:bg-white/10 hover:text-white"
                >
                  Apagar e reiniciar
                </button>
              )}
              {usuario && (
                <button
                  type="button"
                  onClick={() => setMostrarCatalogos(true)}
                  className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2 text-xs font-semibold text-slate-200 hover:border-white/20 hover:bg-white/10 hover:text-white"
                >
                  Meus catálogos
                </button>
              )}
              <button
                type="button"
                onClick={() => setMostrarConta(true)}
                className="rounded-xl bg-white px-3 py-2 text-xs font-extrabold text-night shadow-md hover:bg-emerald-50"
              >
                {usuario ? usuario.nome.split(" ")[0] : "Entrar"}
              </button>
            </div>
          </div>

          <ol className="mt-7 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Etapas do processamento">
            {ETAPAS.map((passo, indice) => {
              const ativa = etapa === passo.id;
              const concluida = indice < indiceEtapa;
              return (
                <li
                  key={passo.id}
                  aria-current={ativa ? "step" : undefined}
                  className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition ${
                    ativa
                      ? "border-white/20 bg-white text-night shadow-lg"
                      : concluida
                        ? "border-emerald-400/20 bg-emerald-400/10 text-white"
                        : "border-white/[0.08] bg-white/[0.04] text-slate-400"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold ${
                      ativa
                        ? "bg-accent text-white shadow-glow"
                        : concluida
                          ? "bg-emerald-400/20 text-emerald-300"
                          : "bg-white/[0.07] text-slate-400"
                    }`}
                  >
                    {concluida ? "✓" : indice + 1}
                  </span>
                  <span>
                    <span className="block text-sm font-bold">{passo.titulo}</span>
                    <span className={`block text-xs ${ativa ? "text-slate-500" : "text-current opacity-70"}`}>
                      {passo.descricao}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </header>

      {restaurado && (
        <div className="mx-auto mt-5 flex max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex w-full items-center justify-between rounded-2xl border border-accent/20 bg-emerald-50 px-4 py-3 text-sm text-accentDark shadow-sm">
            <span><strong>Sessão recuperada.</strong> O progresso fica salvo neste dispositivo por até 7 dias.</span>
            <button onClick={() => setRestaurado(false)} className="rounded-lg px-2 py-1 font-bold hover:bg-emerald-100">
              Fechar
            </button>
          </div>
        </div>
      )}

      <section className="animate-enter mx-auto mt-8 max-w-7xl px-4 sm:px-6 lg:px-8" key={etapa}>
        {etapa === "upload" && (
          <PassoUpload
            salvarSessao={salvarSessao}
            onSalvarSessao={alterarPersistencia}
            onCarregado={(novasEntradas, novoNomeArquivo) => {
              setEntradas(novasEntradas);
              setNomeArquivo(novoNomeArquivo);
              setLinhas(null);
              setEtapa("configurar");
            }}
          />
        )}

        {etapa === "configurar" && entradas && (
          <PassoConfiguracao
            entradas={entradas}
            valorInicial={config}
            onVoltar={() => setEtapa("upload")}
            onConfirmar={(novoConfig) => {
              setConfig(novoConfig);
              setLinhas(processarLinhas(entradas, novoConfig).linhas);
              setEtapa("validar");
            }}
          />
        )}

        {etapa === "validar" && linhas && (
          <PassoValidacao
            linhas={linhas}
            config={config}
            onVoltar={() => setEtapa("configurar")}
            onContinuar={(linhaId) => { setFocoLinhaId(linhaId ?? null); setEtapa("revisar"); }}
          />
        )}

        {etapa === "revisar" && linhas && (
          <PassoRevisao
            linhas={linhas}
            config={config}
            nomeArquivo={nomeArquivo}
            onLinhasAtualizadas={setLinhas}
            onVoltar={() => setEtapa("validar")}
            focoLinhaId={focoLinhaId}
            usuario={usuario}
            onEntrar={() => setMostrarConta(true)}
            onAbrirCatalogos={() => setMostrarCatalogos(true)}
          />
        )}
      </section>

      {mostrarConta && (
        <ContaModal
          configurado={mongoConfigurado}
          usuario={usuario}
          onFechar={() => setMostrarConta(false)}
          onUsuarioAlterado={alterarUsuario}
        />
      )}
      {mostrarCatalogos && usuario && (
        <CatalogosModal onFechar={() => setMostrarCatalogos(false)} onCarregar={carregarCatalogo} />
      )}
    </main>
  );
}
