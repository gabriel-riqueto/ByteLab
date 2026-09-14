"use client";

import { useRef, useState } from "react";
import { analisarCsvEntrada, decodificarCsvUtf8, ErroCodificacaoCsv } from "@/lib/csv";
import { InputRow } from "@/lib/types";

interface Props {
  onCarregado: (entradas: InputRow[], nomeArquivo: string) => void;
  salvarSessao: boolean;
  onSalvarSessao: (salvar: boolean) => void;
}

interface ArquivoPendente {
  nome: string;
  linhas: InputRow[];
  colunasFaltantes: string[];
}

const TAMANHO_MAXIMO = 10 * 1024 * 1024;
const LINHAS_MAXIMAS = 20_000;

export default function PassoUpload({ onCarregado, salvarSessao, onSalvarSessao }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<{ mensagem: string; detalhes?: string[] } | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [arquivoPendente, setArquivoPendente] = useState<ArquivoPendente | null>(null);
  const [processando, setProcessando] = useState(false);

  async function processarArquivo(arquivo: File) {
    setErro(null);
    setArquivoPendente(null);

    if (!arquivo.name.toLowerCase().endsWith(".csv")) {
      setErro({ mensagem: "Escolha um arquivo no formato CSV." });
      return;
    }
    if (arquivo.size > TAMANHO_MAXIMO) {
      setErro({ mensagem: "O arquivo ultrapassa o limite de 10 MB." });
      return;
    }

    setProcessando(true);
    try {
      const texto = decodificarCsvUtf8(new Uint8Array(await arquivo.arrayBuffer()));
      const resultado = analisarCsvEntrada(texto);
      if (resultado.errosEstrutura.length > 0) {
        setErro({
          mensagem: "O CSV possui linhas com quantidade de campos incorreta ou conteúdo malformado.",
          detalhes: resultado.errosEstrutura,
        });
        return;
      }
      if (resultado.linhas.length === 0) {
        setErro({ mensagem: "Não encontramos nenhuma linha de produto nesse arquivo." });
        return;
      }
      if (resultado.linhas.length > LINHAS_MAXIMAS) {
        setErro({ mensagem: `O limite por lote é de ${LINHAS_MAXIMAS.toLocaleString("pt-BR")} produtos.` });
        return;
      }

      setArquivoPendente({ nome: arquivo.name, linhas: resultado.linhas, colunasFaltantes: resultado.colunasFaltantes });
    } catch (falha) {
      setErro({ mensagem: falha instanceof ErroCodificacaoCsv
        ? falha.message
        : "Não foi possível acessar o arquivo. Tente selecioná-lo novamente." });
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Passo 1 · Importação</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Comece pela sua planilha</h2>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-slate-600">
            Nós conferimos a estrutura e mostramos uma prévia antes de processar qualquer produto.
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow-sm">
          CSV · até 10 MB · processamento local
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="Selecionar planilha CSV"
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          const arquivo = e.dataTransfer.files?.[0];
          if (arquivo) void processarArquivo(arquivo);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={`panel group relative cursor-pointer overflow-hidden rounded-3xl border-2 border-dashed p-10 text-center transition-all focus:outline-none focus:ring-4 focus:ring-accent/20 sm:p-16 ${
          arrastando
            ? "scale-[1.01] border-accent bg-emerald-50 shadow-glow"
            : "border-slate-300 hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-float"
        }`}
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-accent/70 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-night text-white shadow-lg transition-transform group-hover:-translate-y-1 ${processando ? "animate-pulse" : ""}`}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-7 w-7" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 13v5a2 2 0 002 2h10a2 2 0 002-2v-5" />
          </svg>
        </div>
        <p className="mt-5 text-xl font-bold text-ink">{processando ? "Lendo sua planilha…" : "Solte o CSV aqui"}</p>
        <p className="mt-2 text-sm text-slate-500">ou clique nesta área para escolher o arquivo</p>
        <span className="mt-5 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
          O CSV permanece neste navegador
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            if (arquivo) void processarArquivo(arquivo);
            e.target.value = "";
          }}
        />
      </div>

      {erro && (
        <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-danger shadow-sm">
          <p className="font-medium">{erro.mensagem}</p>
          {erro.detalhes && (
            <ul className="mt-2 list-inside list-disc space-y-1 text-ink/70">
              {erro.detalhes.map((detalhe) => (
                <li key={detalhe}>{detalhe}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {arquivoPendente && (
        <section className="panel mt-6 overflow-hidden rounded-3xl" aria-labelledby="previa-titulo">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-white px-6 py-5">
            <div>
              <p className="eyebrow">Arquivo reconhecido</p>
              <h2 id="previa-titulo" className="mt-1 text-lg font-bold text-ink">Prévia da importação</h2>
              <p className="text-sm text-ink/60">
                {arquivoPendente.nome} · {arquivoPendente.linhas.length.toLocaleString("pt-BR")} produto(s)
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setArquivoPendente(null)}
                className="button-secondary"
              >
                Trocar arquivo
              </button>
              <button
                type="button"
                onClick={() => onCarregado(arquivoPendente.linhas, arquivoPendente.nome)}
                className="button-primary"
              >
                Confirmar importação
              </button>
            </div>
          </div>
          {arquivoPendente.colunasFaltantes.length > 0 && (
            <p className="border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-900" role="status">
              Colunas não identificadas: {arquivoPendente.colunasFaltantes.join(", ")}. Você pode continuar; cada valor ausente será identificado na validação para corrigir na revisão.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left text-sm">
              <caption className="sr-only">Primeiras cinco linhas da planilha selecionada</caption>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">SKU</th>
                  <th className="px-4 py-2 font-medium">Produto</th>
                  <th className="px-4 py-2 font-medium">Grupo/modelo</th>
                  <th className="px-4 py-2 font-medium">Tipo Amazon</th>
                  <th className="px-4 py-2 font-medium">Departamento</th>
                  <th className="px-4 py-2 font-medium">Cor</th>
                  <th className="px-4 py-2 font-medium">Tamanho</th>
                  <th className="px-4 py-2 font-medium">Preço</th>
                  <th className="px-4 py-2 font-medium">Estoque</th>
                </tr>
              </thead>
              <tbody>
                {arquivoPendente.linhas.slice(0, 5).map((linha) => (
                  <tr key={`${linha.linha}-${linha.sku}`} className="border-t border-slate-100 transition-colors hover:bg-emerald-50/40">
                    <td className="px-4 py-2">{linha.sku || "—"}</td>
                    <td className="px-4 py-2">{linha.nome || "—"}</td>
                    <td className="px-4 py-2 text-ink/60">{linha.grupo || "Pelo nome"}</td>
                    <td className="px-4 py-2 text-ink/60">{linha.tipoProduto || "Detectar pelo nome"}</td>
                    <td className="px-4 py-2 text-ink/60">{linha.departamento || "Usar padrão"}</td>
                    <td className="px-4 py-2">{linha.cor || "—"}</td>
                    <td className="px-4 py-2">{linha.tamanho || "—"}</td>
                    <td className="px-4 py-2">{linha.preco || "—"}</td>
                    <td className="px-4 py-2">{linha.quantidade === undefined ? "Padrão do lote" : linha.quantidade || "(vazio)"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 px-1 text-sm">
        <a
          href="/bytelab_teste_1_C_erro_.csv"
          download
          className="font-medium text-accentDark underline underline-offset-2 hover:text-accent"
        >
          Baixar planilha de exemplo
        </a>
        <span className="text-ink/50">Campos essenciais: SKU, nome, preço, cor e tamanho · opcionais: imagem, grupo, tipo, departamento, GTIN e estoque. Aceita nomes de colunas equivalentes.</span>
      </div>

      <div className="mt-7">
        <details className="panel group rounded-2xl">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-bold text-ink">
            <span>Pré-requisitos das plataformas</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-lg text-slate-500 transition group-open:rotate-45">+</span>
          </summary>
          <div className="grid gap-5 border-t border-slate-100 px-5 py-4 text-sm leading-relaxed text-slate-600 sm:grid-cols-2">
            <div>
              <p className="font-extrabold text-ink">Amazon</p>
              <ul className="mt-2 space-y-2">
                <li>• Conta Seller Central com plano ativo.</li>
                <li>• Categoria liberada e GTIN válido ou isenção aprovada.</li>
                <li>• Conferência no modelo oficial antes do envio.</li>
              </ul>
            </div>
            <div>
              <p className="font-extrabold text-ink">Mercado Livre</p>
              <ul className="mt-2 space-y-2">
                <li>• Conta de vendedor e categoria MLB correta.</li>
                <li>• Atributos obrigatórios conferidos por categoria.</li>
                <li>• Saída atual é apenas um rascunho JSON, sem publicação.</li>
              </ul>
            </div>
          </div>
        </details>
      </div>

      <div className="mt-10">
        <details className="panel group rounded-2xl border-emerald-200 bg-emerald-50/40">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-bold text-ink">
            <span>Privacidade e LGPD</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-lg text-accentDark transition group-open:rotate-45">+</span>
          </summary>
          <div className="space-y-4 border-t border-slate-100 px-5 py-4 text-sm leading-relaxed text-slate-600">
            <p>
              A planilha é processada neste navegador. Ela só é enviada ao banco se você entrar em uma conta e usar
              explicitamente “Salvar na conta”; o CSV original não é armazenado. As URLs de imagem são acessadas
              diretamente pelos respectivos provedores para exibir as miniaturas.
            </p>
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <input
                type="checkbox"
                checked={salvarSessao}
                onChange={(e) => onSalvarSessao(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-accent accent-accent"
              />
              <span>Salvar meu progresso neste dispositivo por até 7 dias.</span>
            </label>
            <p className="text-xs text-ink/50">
              Em computador compartilhado, mantenha essa opção desmarcada. Você pode apagar os dados a qualquer momento. Leia o <a href="/privacidade" target="_blank" className="font-bold text-accentDark underline">aviso de privacidade completo</a>.
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}
