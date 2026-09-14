# Privacidade e LGPD no ByteLab

O ByteLab foi projetado para minimizar o tratamento de dados: a leitura, a validação e a transformação da planilha acontecem no navegador. Contas e catálogos salvos usam um backend com MongoDB, mas esse envio só ocorre após ação explícita do usuário. O projeto não inclui cookies de publicidade ou telemetria.

## Dados utilizados e finalidade

Durante o uso, o navegador pode manipular:

- dados do catálogo presentes no CSV;
- nome do arquivo selecionado;
- configurações do lote e correções feitas na revisão;
- URLs das imagens dos produtos;
- nome e e-mail da conta;
- derivação criptográfica da senha e hash do token de sessão;
- catálogos processados que o usuário decidir salvar.

Esses dados são usados exclusivamente para preparar o arquivo de catálogo solicitado pelo usuário. O catálogo normalmente contém dados de produtos, mas o usuário deve evitar inserir dados pessoais desnecessários, dados pessoais sensíveis ou informações de clientes e funcionários.

## Armazenamento e retenção

O salvamento local do progresso é opcional e vem desativado por padrão. Quando ativado, os dados ficam no `localStorage` do navegador por até sete dias, separados pelo identificador da conta autenticada. O comando **Apagar e reiniciar**, o logout e a exclusão da conta removem essa sessão imediatamente.

O MongoDB recebe apenas o catálogo processado quando um usuário autenticado seleciona **Salvar na conta**. O CSV bruto não é armazenado. Sessões remotas expiram em sete dias e os registros hasheados de limitação de login, em quinze minutos. A interface permite excluir catálogos individualmente ou excluir a conta com seus catálogos e sessões.

O `localStorage` não é um cofre criptografado. Em computador compartilhado, a recomendação é manter o salvamento desativado e apagar a sessão ao concluir o trabalho.

## Compartilhamento e imagens externas

O ByteLab não envia automaticamente a planilha a um servidor. A imagem é opcional. Quando o CSV contém uma URL e o ByteLab exibe uma miniatura, o navegador acessa diretamente essa URL; o provedor da imagem recebe uma requisição normal de internet. A aplicação usa política de referência `no-referrer` para reduzir os dados enviados nessa requisição. Sem URL, não é carregada nenhuma imagem externa para aquela linha.

O envio a Amazon ou Mercado Livre só ocorre depois que o usuário baixa o arquivo e decide tratá-lo fora do ByteLab. A aplicação não publica anúncios diretamente nesta versão.

## Medidas técnicas adotadas

- processamento local e minimização de dados;
- retenção limitada e exclusão acessível;
- limite de tamanho e validação estrutural do CSV;
- proteção contra fórmulas em planilhas exportadas;
- validação de URLs, GTINs, SKUs e quantidades;
- cabeçalhos de segurança, política de conteúdo e bloqueio de enquadramento da página;
- ausência de credenciais incorporadas ao código e de rastreadores;
- senhas derivadas com scrypt e salt individual, sem armazenamento em texto puro;
- tokens aleatórios armazenados apenas como hash e cookie HttpOnly/SameSite/Secure em produção;
- isolamento de catálogos por usuário, proteção de origem e limitação de tentativas de login;
- índices TTL para exclusão automática de sessões e tentativas expiradas.

## Antes de uso em produção

O responsável pela implantação deve identificar o controlador, informar CNPJ e canal de contato, documentar finalidade e base legal, definir retenção de contas e catálogos, procedimento de atendimento aos titulares e incidentes, além de revisar MongoDB Atlas e hospedagem como operadores. Região, backups, logs e possível transferência internacional devem constar dos registros e contratos aplicáveis.

O aviso exibido na aplicação usa `NEXT_PUBLIC_PRIVACY_CONTACT`. Essa variável e a identificação completa do controlador devem ser preenchidas antes de uso em produção.

Estas medidas ajudam a aplicar privacidade desde a concepção, mas o código isoladamente não garante conformidade jurídica integral. A operação deve ser revisada conforme a finalidade e o contexto reais.

## Referências oficiais

- [Lei nº 13.709/2018 — Lei Geral de Proteção de Dados Pessoais](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/L13709compilado.htm)
- [Materiais educativos e publicações da ANPD](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes)
