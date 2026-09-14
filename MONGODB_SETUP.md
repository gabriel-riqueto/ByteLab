# Configuração do MongoDB para o ByteLab

O MongoDB Compass é apenas o programa usado para visualizar e administrar um banco. Para o ByteLab funcionar localmente e depois poder ser publicado, crie um banco no **MongoDB Atlas** e conecte o projeto a ele.

> Não envie a string de conexão nem a senha do banco em mensagens, screenshots ou commits. O ByteLab não precisa que essas credenciais sejam compartilhadas com outra pessoa.

## 1. Criar a conta e o cluster

1. Acesse [MongoDB Atlas](https://www.mongodb.com/atlas) e crie uma conta.
2. Crie um projeto chamado `ByteLab`.
3. Clique em **Build a Database** e escolha a opção gratuita disponível para testes (normalmente `M0`) ou o plano desejado.
4. Escolha uma região próxima dos usuários e anote a região para o registro de fornecedores/LGPD.
5. Dê ao cluster um nome como `bytelab-cluster` e conclua a criação.

## 2. Criar um usuário exclusivo do banco

Esse usuário é diferente da sua conta do site do MongoDB.

1. No Atlas, abra **Security → Database Access**.
2. Clique em **Add New Database User**.
3. Escolha autenticação por senha.
4. Use um nome como `bytelab_app`.
5. Gere uma senha forte e guarde-a em um gerenciador de senhas.
6. Em privilégios, prefira acesso `readWrite` somente ao banco `bytelab`. Não use `Atlas Admin` para a aplicação.
7. Salve o usuário.

## 3. Liberar seu IP para desenvolvimento local

1. Abra **Security → Network Access**.
2. Clique em **Add IP Address**.
3. Use **Add My Current IP Address** e, se possível, defina a entrada como temporária.
4. Salve e aguarde o status ficar ativo.

Não use `0.0.0.0/0` no desenvolvimento: isso permite tentativas de conexão a partir de qualquer IP. Em produção, configure a saída de rede do provedor de hospedagem ou uma integração privada. Se uma liberação ampla for inevitável em um protótipo, use senha exclusiva e forte, privilégios mínimos e remova a regra assim que possível.

## 4. Copiar a string de conexão

1. Volte a **Database/Clusters** e clique em **Connect**.
2. Escolha **Drivers** e depois **Node.js**.
3. Copie a string iniciada por `mongodb+srv://`.
4. Substitua `<db_username>` e `<db_password>` pelo usuário criado e sua senha.

Se a senha tiver caracteres reservados de URL, eles precisam ser codificados. Você pode gerar o trecho codificado localmente:

```bash
node -e "console.log(encodeURIComponent(process.argv[1]))" "SUA_SENHA"
```

## 5. Configurar o projeto

Na pasta do ByteLab:

1. Copie `.env.example` para `.env.local`.
2. Preencha as variáveis:

```env
MONGODB_URI=mongodb+srv://bytelab_app:SENHA_CODIFICADA@SEU_CLUSTER.mongodb.net/?retryWrites=true&w=majority&appName=ByteLab
MONGODB_DB=bytelab
BYTELAB_SESSION_SECRET=COLOQUE_UM_SEGREDO_ALEATORIO
NEXT_PUBLIC_PRIVACY_CONTACT=seu-canal-de-privacidade@dominio.com
```

3. Gere o segredo de sessão com um destes comandos:

PowerShell:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

4. Instale as dependências e inicie:

```bash
npm install
npm run dev
```

5. Abra `http://localhost:3000`, clique em **Entrar → Criar conta** e faça o primeiro cadastro.

As coleções e os índices são criados automaticamente no primeiro uso. Não é preciso criá-los no Compass.

## 6. Conferir pelo Compass

1. Abra o Compass.
2. Cole a mesma string `MONGODB_URI` no campo de conexão.
3. Conecte e abra o banco `bytelab`.
4. Após criar uma conta e salvar um catálogo, devem existir as coleções:

| Coleção | Conteúdo | Retenção técnica |
|---|---|---|
| `users` | conta e hash de senha | até exclusão da conta/política do controlador |
| `sessions` | hash do token de sessão | TTL de 7 dias |
| `catalogs` | catálogos salvos explicitamente | até exclusão pelo usuário/política definida |
| `login_attempts` | chaves hasheadas de limitação | TTL de 15 minutos |

É normal não ver a senha original nem o token de sessão: o ByteLab não os armazena em texto legível.

## 7. Checklist antes de publicar

- Cadastre no provedor de hospedagem as mesmas variáveis, sem prefixo público, exceto `NEXT_PUBLIC_PRIVACY_CONTACT`.
- Mantenha HTTPS obrigatório; o cookie `Secure` é ativado em produção.
- Defina controlador, CNPJ, canal de privacidade, política de retenção, operadores, backups e resposta a incidentes.
- Restrinja a rede do Atlas e mantenha o usuário do banco com privilégio mínimo.
- Ative alertas, backups conforme o risco e rotação periódica das credenciais.
- Teste exclusão de catálogo e de conta em um ambiente de homologação.

## Referências oficiais

- [Conexão e segurança inicial do MongoDB Atlas](https://www.mongodb.com/docs/atlas/security/quick-start/)
- [Usuários de banco no Atlas](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/)
- [Lista de acesso por IP](https://www.mongodb.com/docs/atlas/security/ip-access-list/)
- [Driver oficial do MongoDB para Node.js](https://www.mongodb.com/docs/drivers/node/current/)
