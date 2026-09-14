# ByteLab — Catálogos de roupas para marketplaces

> Versão 5. Mantém contas/MongoDB e acrescenta múltiplos tipos por lote, mapeamento de cabeçalhos e validação detalhada por linha.

## 1. Visão do produto

A ByteLab transforma uma planilha simples de produtos de vestuário em catálogos estruturados para diferentes marketplaces, sem exigir conhecimento técnico do vendedor.

**Mudança de expectativa (frente: conformidade Amazon):** este MVP entrega um arquivo de **partida** com os campos centrais preenchidos e validados, não uma garantia de upload sem erros. A Amazon exige dezenas de atributos específicos por subcategoria (tecido, gola, GTIN, nó de navegação) que variam por tipo exato de produto — isso está fora do escopo do MVP e é sinalizado no próprio produto (ver §8).

## 2. Objetivo do MVP

- Importar produtos de vestuário via CSV
- Padronizar cor, tamanho, título e preço automaticamente
- Agrupar variações em estrutura pai/filho
- Gerar um arquivo com os campos centrais de um listing de vestuário na Amazon
- Gerar um JSON de trabalho para Mercado Livre, identificado como rascunho não validado
- Permitir conta de usuário e histórico opcional de catálogos processados
- Dar ao vendedor um checkpoint real de revisão — não deixar um erro óbvio passar direto para o arquivo final

## 3. Escopo do MVP

### Inclusões
- Upload de CSV com aliases para `sku`, `nome`, `preço`, `cor` e `tamanho`; `url da imagem`, `gtin`, `grupo/modelo`, `tipo_produto`, `departamento` e `estoque` são opcionais. Colunas essenciais ausentes são reportadas por linha, sem rejeitar o lote.
- Configuração de lote (marca, departamento padrão, tipo padrão opcional, sistema de tamanho, quantidade padrão, isenção de GTIN); departamento e tipo podem variar por família, estoque por linha.
- Padronização: título comercial, dicionário de cores PT→EN, dicionário de tamanhos (P/M/G, numérico, "único"), formatação de preço (BR e US)
- Agrupamento pela coluna opcional `grupo/modelo`; na ausência dela, pelo nome normalizado do produto
- **Tema de variação calculado**, não fixo: `Size`, `Color` ou `SizeColor`, conforme o que de fato varia dentro do grupo
- Estrutura pai (não vendável, campos de preço/estoque/cor/tamanho em branco) + filhos (vendáveis)
- Tela de revisão com status por linha (OK / Revisar / Bloqueado), filtros, desfazer, edição inline, remapeamento de cor/tamanho, reatribuição e criação manual de grupo
- Tela de validação após a normalização com cards derivados do lote e problemas clicáveis por linha original, campo e valor
- Exportação parcial: linhas bloqueadas ficam de fora automaticamente, com confirmação explícita antes do download
- Exportação em CSV ou TSV (.txt)
- Sessão opcional no navegador (`localStorage`), desativada por padrão, com retenção máxima de sete dias e exclusão imediata
- Cadastro/login por e-mail e senha e salvamento explícito no MongoDB
- Tela de autenticação obrigatória antes do acesso ao fluxo de catálogo
- Exclusão individual de catálogos e exclusão integral da conta pela interface
- Seleção de plataforma por lote: Amazon ou Mercado Livre

### Exclusões (mantidas da v1)
- Integração direta com API da Amazon
- IA para descrição de produto
- Sincronização de estoque
- Conformidade automática com todos os atributos do template oficial de cada subcategoria da Amazon (ver §4)

## 4. Escopo de categoria (novo — frente: conformidade Amazon)

A Amazon não tem um template genérico de "roupas": os atributos exigidos variam por categoria. O MVP aceita **vários tipos de vestuário no mesmo CSV** (por coluna ou detecção conservadora pelo nome), permite confirmar/corrigir a classificação por família e gera um arquivo intermediário CSV/TSV por tipo, empacotado em ZIP quando houver vários. Isso não substitui o template oficial.

## 5. Estrutura de dados de entrada (CSV)

| Campo | Obrigatório | Observação |
|---|---|---|
| sku | sim | identificador único do filho |
| nome | sim | usado como chave de agrupamento (normalizado) |
| preço | sim | aceita `R$ 49,90`, `49,90` ou `49.90` |
| cor | sim | comparado a um dicionário PT→EN; se não reconhecido, fica pendente de revisão |
| tamanho | sim | dicionário P/M/G/numérico/único; idem acima |
| url da imagem | não | se vier preenchida, é preservada; formato inválido gera alerta, mas não bloqueia a exportação |
| gtin | não | código de barras (EAN/UPC/GTIN); se ausente, gera aviso a menos que a isenção esteja marcada |
| grupo/modelo | não | identificador explícito do produto pai; recomendado quando as variações têm nomes diferentes |
| tipo_produto / departamento | não | podem variar por família; sem tipo, detecta pelo nome ou exige seleção manual |
| quantidade / estoque | não | se não houver coluna, aplica o padrão; célula vazia ou inválida bloqueia a variação |

Campos essenciais podem estar sem coluna na origem; a validação indica as linhas bloqueadas. Imagem ausente não gera alerta nem erro. A importação continua limitada a CSV UTF-8, não XLSX. Bytes inválidos para UTF-8 geram um erro de codificação distinto de erros estruturais do CSV e de problemas nos produtos.

Aliases de cabeçalho são aceitos (ex: `codigo`, `preço de venda`, `foto`) — ver `lib/csv.ts`.

## 6. Configuração de lote (novo — resolve a lacuna "de onde vêm Marca/Departamento/Quantidade/Tipo" da v1)

Coletada uma vez por upload, aplicada a todas as linhas:

- **Marca** (brand_name)
- **Departamento padrão (opcional)** (department_name) — ex: `mens`, `womens`, `unisex-adult`; se uma família não tiver departamento na planilha nem padrão, será identificada na validação e precisará de correção antes da exportação
- **Gênero-alvo** (target_gender) — `male` / `female` / `unisex`
- **Faixa etária** (age_range_description) — `Adult` / `Kids` / `Baby`
- **Tipo de produto padrão** (product_type) — opcional; pode variar por família (ver §4)
- **Sistema de tamanho** (size_system) — ex: `BR`
- **Quantidade padrão** (quantity) — exigida na configuração apenas quando não houver coluna de estoque; valores individuais são validados
- **Isenção de GTIN** — checkbox; se marcado, suprime o aviso de GTIN ausente

## 7. Processamento de dados

### Padronização
- Título comercial (capitalização, preposições minúsculas)
- Cor: dicionário PT→EN, comparação case/acento-insensível
- Tamanho: dicionário P/M/G→XS-XXL, tamanhos numéricos passam direto, "único"→"One Size"
- Preço: aceita separador decimal BR (`,`) ou US (`.`), rejeita valores ≤ 0 ou não numéricos

### Agrupamento
- Chave de agrupamento = `grupo/modelo` normalizado; na ausência da coluna, nome normalizado (trim, minúsculas, sem acento)
- SKU do produto pai: gerado deterministicamente (`slug(nome)` + hash curto), garante unicidade mesmo entre grupos com nomes parecidos
- Reatribuição manual: qualquer filho pode ser movido para outro grupo já detectado no lote pela tela de revisão, caso o agrupamento automático erre (nomes com typo, etc.)
- Separação manual: uma variação pode originar um novo grupo diretamente na revisão
- Duplicidades: bloqueio de SKU repetido e de combinações cor/tamanho repetidas dentro do mesmo grupo

### Tema de variação (corrige hardcode da v1)
Calculado por grupo, não fixo:
- `Size` — se só o tamanho varia entre os filhos
- `Color` — se só a cor varia
- `SizeColor` — se ambos variam (ou como padrão para grupos de 1 filho)

## 8. Estrutura de saída

Duas colunas que a v1 tratava como uma só (`Tipo de relacionamento`) foram separadas, pois a Amazon as trata de forma diferente:

| Coluna (interna → Amazon) | Pai | Filho |
|---|---|---|
| sku | SKU pai gerado | SKU do filho (do CSV) |
| parent_sku | *(vazio)* | SKU do pai |
| **parentage** | `parent` | `child` |
| **relationship_type** | *(vazio)* | `variation` |
| item_name | nome base do grupo | nome base + " - " + cor + tamanho |
| brand_name / department_name / target_gender / age_range_description / product_type / size_system | do lote | do lote |
| external_product_id (gtin) | *(vazio)* | do CSV, se houver e for válido |
| external_product_id_type | *(vazio)* | `EAN`, `UPC` ou `GTIN`, derivado do comprimento |
| standard_price / quantity | ***(vazio — pai não é vendável)*** | valor do filho |
| color_name / size_name | *(vazio)* | valor padronizado |
| variation_theme | calculado (§7) | igual ao do pai |
| main_image_url | imagem do 1º filho, se houver | imagem do filho, se houver; sem URL permanece vazio |

**Nota de honestidade (frente: conformidade Amazon):** este conjunto de colunas cobre os campos centrais e universais de um listing de vestuário. Ele **não** inclui atributos condicionais por subcategoria (tecido, gola, tipo de manga etc.), nem reproduz o arquivo `.xlsm`/tab-delimitado com as linhas de cabeçalho ocultas que o Seller Central espera no upload oficial. O arquivo gerado deve ser tratado como um **ponto de partida para colar no template oficial da categoria exata**, não como substituto dele.

## 9. Fluxo do usuário

1. **Upload** — arrastar/selecionar CSV; prévia, privacidade e checklist das plataformas
2. **Configurar lote** — escolher Amazon ou Mercado Livre e preencher os campos aplicáveis
3. **Validar** — cards de SKUs, alertas e erros críticos calculados dos produtos; categorias clicáveis mostram linha original, SKU, produto, campo, valor e explicação.
4. **Revisar e exportar** — checkpoint real, não uma tela passiva:
   - status por linha (OK / Revisar / Bloqueado) com a lista de motivos
   - cor/tamanho original exibido ao lado do valor padronizado
   - remapeamento por dropdown para valores não reconhecidos + "aplicar a todas as linhas iguais"
   - miniatura e edição da URL da imagem, com aviso se ela não carregar
   - reatribuição de grupo por linha e criação de um novo grupo
   - filtros por status, atalho para o próximo problema e histórico de desfazer
   - export não deixa passar linhas bloqueadas silenciosamente: mostra quantas ficarão de fora e exige confirmação
5. **Download** — CSV/TSV para Amazon (ZIP por tipo se houver mais de um) ou JSON de rascunho para Mercado Livre

## 10. Arquitetura (revisado — frente: escopo/produto)

O processamento do arquivo é separado da persistência para reduzir a exposição dos dados:

- **Processamento client-side** — parsing, padronização e exportação continuam no navegador
- **Backend Next.js + MongoDB Atlas** — usado somente para conta, sessão e catálogos que o usuário salvar explicitamente
- **Sessão opcional em `localStorage`** vinculada ao usuário autenticado, com retenção limitada a sete dias e exclusão no logout
- **Sessão autenticada** por token opaco em cookie HttpOnly; somente o hash do token fica no banco
- **Senhas** protegidas com scrypt e salt individual; limitação de tentativas por chave não reversível

### Privacidade e segurança

- Nenhum CSV bruto é enviado automaticamente ao backend ByteLab
- Apenas o catálogo processado é persistido após clique explícito em “Salvar na conta”
- Nenhuma telemetria ou cookie publicitário é incluído
- URLs externas são carregadas com política `no-referrer`
- Arquivos exportados recebem proteção contra fórmulas de planilha
- Cabeçalhos de segurança restringem conteúdo, enquadramento e recursos do navegador
- O responsável por uma implantação real ainda deve definir controlador, base legal, contato e processo de atendimento aos titulares; ver [`PRIVACIDADE.md`](PRIVACIDADE.md)

O controlador da implantação ainda deve completar identificação, canal, base legal, retenção e contratos com operadores conforme `PRIVACIDADE.md`.

## 11. Pré-requisitos da Amazon (novo — frente: escopo/produto)

Fora do controle do arquivo gerado, mas fatal para o vendedor se ignorado — por isso exibido como checklist estático na tela de upload:

- Plano de vendas ativo no Seller Central (geralmente Profissional)
- Categoria "Roupas, calçados e joias" aprovada/liberada na conta
- GTIN/EAN/UPC válido, ou isenção aprovada pela Amazon para a marca

## 12. Métricas de sucesso

- Produtos processados por sessão
- Taxa de linhas que chegam a "OK" sem edição manual (mede a qualidade do dicionário de padronização)
- Taxa de linhas bloqueadas na primeira passada (mede o quão "sujo" é o CSV de entrada real)
- Feedback qualitativo de vendedores-piloto sobre se o arquivo gerado foi aceito no upload real da Amazon

## 13. Roadmap pós-MVP

- Tradução de erros do relatório de processamento da Amazon de volta para o usuário (loop fechado)
- Campos condicionais por subcategoria exata (tecido, gola, manga...) via lookup por `product_type`
- Geração do `.xlsm`/tab-delimitado oficial da categoria em vez de CSV genérico
- Integração direta com a API da Amazon (SP-API)
- Ampliação dos tipos e atributos além do vocabulário atual de vestuário
- Consulta dinâmica de categorias e atributos obrigatórios do Mercado Livre
- OAuth e publicação assistida no Mercado Livre após validação oficial do payload
- Recuperação de senha e autenticação social
