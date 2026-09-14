import Link from "next/link";

export const metadata = {
  title: "Privacidade e LGPD — ByteLab",
};

export default function Privacidade() {
  const contato = process.env.NEXT_PUBLIC_PRIVACY_CONTACT?.trim();

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6">
      <article className="panel mx-auto max-w-3xl rounded-3xl p-6 sm:p-10">
        <Link href="/" className="text-sm font-bold text-accentDark hover:text-accent">← Voltar ao ByteLab</Link>
        <p className="eyebrow mt-8">Aviso de privacidade</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink">Privacidade e LGPD</h1>
        <p className="mt-3 text-sm text-slate-500">Versão de 4 de setembro de 2026.</p>

        <div className="prose-privacy mt-8 space-y-8 text-sm leading-7 text-slate-600">
          <section>
            <h2 className="text-lg font-extrabold text-ink">Quem trata os dados</h2>
            <p className="mt-2">A organização responsável pela implantação do ByteLab atua como controladora dos dados. Antes do uso em produção, ela deve informar razão social, CNPJ e canal de privacidade neste aviso.</p>
            <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
              {contato ? <>Canal para solicitações: <strong>{contato}</strong>.</> : <><strong>Ambiente acadêmico:</strong> o responsável pela implantação ainda precisa definir o canal de atendimento em <code>NEXT_PUBLIC_PRIVACY_CONTACT</code>.</>}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-extrabold text-ink">Dados, finalidade e minimização</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>Nome, e-mail e derivação criptográfica da senha: criar e proteger a conta.</li>
              <li>Token de sessão armazenado de forma não reversível: manter o login.</li>
              <li>Catálogos processados: somente quando o usuário escolhe “Salvar na conta”, para permitir retomada e histórico.</li>
              <li>Chaves não reversíveis de tentativas de acesso: reduzir abuso e ataques à conta.</li>
            </ul>
            <p className="mt-2">O CSV é lido no navegador. O arquivo bruto não é enviado nem armazenado; apenas o catálogo já processado é salvo mediante ação explícita. Não inclua dados pessoais ou sensíveis em campos de produto.</p>
          </section>

          <section>
            <h2 className="text-lg font-extrabold text-ink">Base legal e retenção</h2>
            <p className="mt-2">A organização responsável deve registrar a base legal adequada ao contexto real. Para os recursos solicitados pelo titular, a operação pode ser necessária à prestação do serviço; obrigações legais e segurança podem exigir bases específicas. A caixa no cadastro comprova leitura do aviso e não substitui essa análise.</p>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>Sessões expiram em sete dias; registros de limitação de acesso, em quinze minutos.</li>
              <li>Conta e catálogos permanecem até exclusão pelo próprio usuário ou pela política definida pelo controlador.</li>
              <li>O progresso local é opcional, fica no navegador por até sete dias e pode ser apagado imediatamente.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-extrabold text-ink">Compartilhamento e infraestrutura</h2>
            <p className="mt-2">A implantação pode usar MongoDB Atlas e um provedor de hospedagem como operadores de infraestrutura. Região, suboperadores, retenção de logs, backups e eventual transferência internacional devem ser configurados e registrados pelo controlador. URLs de imagens são acessadas diretamente pelo navegador, com política de referência restritiva.</p>
          </section>

          <section>
            <h2 className="text-lg font-extrabold text-ink">Segurança e cookies</h2>
            <p className="mt-2">Senhas são derivadas com scrypt e salt individual. Tokens de sessão são aleatórios, armazenados no banco somente como hash e enviados em cookie essencial HttpOnly, SameSite=Lax e Secure em produção. Há limitação de tentativas, isolamento dos catálogos por usuário e proteção de origem nas operações de alteração.</p>
          </section>

          <section>
            <h2 className="text-lg font-extrabold text-ink">Seus direitos</h2>
            <p className="mt-2">O titular pode solicitar confirmação, acesso, correção, anonimização, portabilidade quando aplicável, informação sobre compartilhamentos, revisão de decisões automatizadas e eliminação nos limites da LGPD. A interface permite excluir catálogos e a conta; outras solicitações devem ser encaminhadas ao canal do controlador.</p>
          </section>

          <section>
            <h2 className="text-lg font-extrabold text-ink">Alterações e responsabilidades</h2>
            <p className="mt-2">Mudanças materiais devem resultar em nova versão deste aviso. O código incorpora medidas de privacidade desde a concepção, mas a conformidade depende também da operação, contratos, registros, resposta a incidentes e atendimento aos titulares.</p>
          </section>
        </div>
      </article>
    </main>
  );
}
