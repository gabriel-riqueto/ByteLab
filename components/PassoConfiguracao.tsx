"use client";

import { useState } from "react";
import { BatchSettings, InputRow } from "@/lib/types";
import { chave, DEPARTAMENTOS, derivarDeDepartamento, TIPOS_PRODUTO } from "@/lib/dictionaries";
import { AVISO_MERCADO_LIVRE } from "@/lib/platforms/mercado-livre";
import { verificarConfiguracao } from "@/lib/configuracao";

const ROTULOS_FAIXA_ETARIA: Record<string, string> = { Adult: "Adulto", Kids: "Infantil", Baby: "Bebê" };
const ROTULOS_GENERO: Record<string, string> = { male: "Masculino", female: "Feminino", unisex: "Unissex" };

interface Props {
  entradas: InputRow[];
  valorInicial: BatchSettings;
  onConfirmar: (config: BatchSettings) => void;
  onVoltar: () => void;
}

function Campo({
  label,
  ajuda,
  children,
}: {
  label: string;
  ajuda?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <div className="mt-2">{children}</div>
      {ajuda && <p className="mt-2 text-xs leading-relaxed text-slate-500">{ajuda}</p>}
    </label>
  );
}

const estiloInput = "field-control";

export default function PassoConfiguracao({ entradas, valorInicial, onConfirmar, onVoltar }: Props) {
  const [config, setConfig] = useState<BatchSettings>(valorInicial);
  const departamentosNaPlanilha = entradas.filter((linha) => linha.departamento.trim()).length;
  const tiposNaPlanilha = entradas.filter((linha) => linha.tipoProduto.trim()).length;
  const gruposDaPlanilha = new Map<string, InputRow[]>();
  for (const linha of entradas) {
    const grupo = chave(linha.grupo || linha.nome) || `sem-nome-linha-${linha.linha}`;
    if (!gruposDaPlanilha.has(grupo)) gruposDaPlanilha.set(grupo, []);
    gruposDaPlanilha.get(grupo)!.push(linha);
  }
  const possuiDepartamentoParaTodosOsGrupos = Array.from(gruposDaPlanilha.values()).every((grupo) =>
    grupo.some((linha) => linha.departamento.trim())
  );
  const { precisaQuantidadePadrao, podeContinuar } = verificarConfiguracao(entradas, config);

  function atualizar<K extends keyof BatchSettings>(campo: K, valor: BatchSettings[K]) {
    setConfig((c) => ({ ...c, [campo]: valor }));
  }

  function atualizarDepartamento(departamento: string) {
    const { generoAlvo, faixaEtaria } = derivarDeDepartamento(departamento);
    setConfig((c) => ({ ...c, departamento, generoAlvo, faixaEtaria }));
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Passo 2 · Configuração</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Defina as informações do lote</h2>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-slate-600">
            Defina os valores padrão. Tipos e departamentos informados na planilha serão respeitados por grupo.
          </p>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800 shadow-sm">
          {entradas.length.toLocaleString("pt-BR")} produtos carregados
        </div>
      </div>

      <div className="panel overflow-hidden rounded-3xl">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-night px-6 py-5 text-white">
          <div>
            <h3 className="text-lg font-bold">Configurações do catálogo</h3>
            <p className="mt-1 text-sm text-slate-400">Os campos com * são obrigatórios para continuar.</p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.07] px-3 py-1 text-xs font-semibold text-emerald-200">
            Múltiplos tipos por lote
          </span>
        </div>

        <div className="space-y-7 p-6 sm:p-8">
        <fieldset>
          <legend className="text-sm font-bold text-slate-700">Plataforma de destino *</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {([
              ["amazon", "Amazon", "CSV ou TSV para conferência no Seller Central"],
              ["mercado_livre", "Mercado Livre", "JSON em modo rascunho para evolução futura"],
            ] as const).map(([valor, titulo, descricao]) => (
              <label
                key={valor}
                className={`cursor-pointer rounded-2xl border p-4 transition ${
                  config.plataforma === valor
                    ? "border-accent bg-emerald-50 shadow-sm ring-2 ring-accent/10"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <span className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="plataforma"
                    value={valor}
                    checked={config.plataforma === valor}
                    onChange={() => atualizar("plataforma", valor)}
                    className="mt-1 accent-accent"
                  />
                  <span>
                    <span className="block font-extrabold text-ink">{titulo}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">{descricao}</span>
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {config.plataforma === "mercado_livre" && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            <strong>Versão experimental.</strong> {AVISO_MERCADO_LIVRE}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <Campo label="Marca *">
          <input
            className={estiloInput}
            value={config.marca}
            onChange={(e) => atualizar("marca", e.target.value)}
            placeholder="Ex: Minha Marca"
          />
          </Campo>

          {config.plataforma === "amazon" ? <Campo
            label="Departamento padrão (opcional)"
            ajuda={possuiDepartamentoParaTodosOsGrupos
              ? `${departamentosNaPlanilha} linha(s) informam o departamento e cobrem todas as famílias. O padrão não será necessário neste arquivo.`
              : "Usado nas famílias sem departamento na planilha. Se deixar vazio, elas aparecerão na validação para correção antes da exportação."}
          >
          <select
            className={estiloInput}
            value={config.departamento}
            onChange={(e) => atualizarDepartamento(e.target.value)}
          >
            <option value="">Selecione…</option>
            {DEPARTAMENTOS.map((d) => (
              <option key={d.valor} value={d.valor}>
                {d.rotulo}
              </option>
            ))}
          </select>
          {config.departamento && (
            <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
              Gênero-alvo: {ROTULOS_GENERO[config.generoAlvo] ?? config.generoAlvo} · Faixa etária:{" "}
              {ROTULOS_FAIXA_ETARIA[config.faixaEtaria] ?? config.faixaEtaria}
            </p>
          )}
          </Campo> : <Campo label="Categoria do Mercado Livre *" ajuda="Use o identificador da categoria brasileira, como MLB1234. Confirme-o no painel ou na API antes de publicar.">
            <input
              className={estiloInput}
              value={config.mlCategoriaId}
              onChange={(e) => atualizar("mlCategoriaId", e.target.value.toUpperCase().replace(/\s/g, ""))}
              placeholder="Ex: MLB1234"
            />
          </Campo>}
        </div>

        {config.plataforma === "amazon" ? <div className="border-t border-slate-100 pt-7">
          <Campo
            label="Tipo de produto padrão (opcional)"
            ajuda={`${tiposNaPlanilha} de ${entradas.length} linhas já informam o tipo. Nas demais, o ByteLab tenta detectar pelo nome; o padrão só é usado quando não houver detecção.`}
          >
          <input
            className={estiloInput}
            value={config.tipoProduto}
            onChange={(e) => atualizar("tipoProduto", e.target.value)}
            list="tipos-produto-comuns"
            placeholder="Ex: Shirt — deixe vazio para detectar"
          />
          <datalist id="tipos-produto-comuns">
            {TIPOS_PRODUTO.map((tipo) => <option key={tipo.valor} value={tipo.valor} />)}
          </datalist>
          </Campo>
        </div> : <div className="grid gap-6 border-t border-slate-100 pt-7 sm:grid-cols-2">
          <Campo label="Condição do produto *">
            <select
              className={estiloInput}
              value={config.mlCondicao}
              onChange={(e) => atualizar("mlCondicao", e.target.value as BatchSettings["mlCondicao"])}
            >
              <option value="new">Novo</option>
              <option value="used">Usado</option>
            </select>
          </Campo>
          <Campo label="Tipo de anúncio (rascunho) *" ajuda="O valor disponível depende da conta e da categoria. Confira antes da publicação.">
            <select
              className={estiloInput}
              value={config.mlTipoAnuncio}
              onChange={(e) => atualizar("mlTipoAnuncio", e.target.value)}
            >
              <option value="gold_special">Clássico (gold_special)</option>
              <option value="gold_pro">Premium (gold_pro)</option>
              <option value="free">Grátis (free)</option>
            </select>
          </Campo>
        </div>}

        <div className="grid gap-6 border-t border-slate-100 pt-7 sm:grid-cols-2">
          <Campo
            label={precisaQuantidadePadrao ? "Quantidade em estoque (padrão) *" : "Quantidade em estoque (padrão, opcional)"}
            ajuda={precisaQuantidadePadrao
              ? "A planilha não informa estoque; o valor padrão será aplicado. Zero indica sem estoque."
              : "A planilha informa estoque; o padrão não será usado. Valores vazios ou inválidos por linha aparecem na validação."}
          >
            <input
              type="number"
              min={0}
              step={1}
              className={estiloInput}
              value={config.quantidadePadrao}
              onChange={(e) => atualizar("quantidadePadrao", Number(e.target.value))}
            />
          </Campo>

          <Campo label="Sistema de tamanho *" ajuda="Selecione o padrão utilizado no lote.">
            <select
              className={estiloInput}
              value={config.sistemaTamanho}
              onChange={(e) => atualizar("sistemaTamanho", e.target.value)}
            >
              <option value="BR">BR</option>
              <option value="US">US</option>
              <option value="EU">EU</option>
              <option value="UK">UK</option>
            </select>
          </Campo>
        </div>

        {config.plataforma === "amazon" && <label className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm leading-relaxed text-amber-950">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
            checked={config.semGtinComIsencao}
            onChange={(e) => atualizar("semGtinComIsencao", e.target.checked)}
          />
          <span>
            Meus produtos não têm código de barras (GTIN/EAN/UPC), mas já tenho isenção aprovada pela Amazon para
            esta marca.
          </span>
        </label>}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <button onClick={onVoltar} className="button-secondary">
          ← Voltar
        </button>
        <button
          disabled={!podeContinuar}
          onClick={() => onConfirmar(config)}
          className="button-primary"
        >
          Processar produtos
        </button>
      </div>
    </div>
  );
}
