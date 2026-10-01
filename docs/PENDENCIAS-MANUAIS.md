# Pendências manuais do ALURE OS

Esta lista reúne o que só você pode fazer, fora do código. O sistema funciona sem esses itens: quando falta uma credencial, o botão do marketplace avisa que a configuração está pendente e nada quebra.

Todas as variáveis vão na Vercel, no projeto `alure-six`, em **Settings → Environment Variables** (ambiente Production). Depois de salvar, faça o **Redeploy**. O arquivo `.env.example` na raiz do projeto lista todas elas.

**Ordem sugerida:** 1 → 2 → 3 → 4 (credenciais), depois 5 (dados do negócio) e 6 (verificações após conectar).

---

## 1. Shopee

**Situação:** o cadastro no Open Platform não terminou. O erro `code 57 / verify code fail` significa que o código enviado por e-mail estava errado ou expirado.

1. Em open.shopee.com, termine o cadastro pedindo um **novo código**. Use o código mais recente e digite logo, porque ele expira em poucos minutos.
2. Escolha o tipo de desenvolvedor **vendedor que integra a própria loja** (Registered Business Seller / Seller In-house System). Não escolha Third-party Partner / ISV.
3. Aguarde a aprovação, que pode levar alguns dias.
4. Em **App List → Create App**, crie um app do tipo **Seller In-house System**.
5. Cadastre como Redirect URL: `https://alure-six.vercel.app/api/integrations/shopee/callback`
6. Copie o **Partner ID** e a **Partner Key** de **produção (Live)** e cadastre na Vercel:

| Variável | Valor |
|---|---|
| `SHOPEE_PARTNER_ID` | Partner ID (só números) |
| `SHOPEE_PARTNER_KEY` | Partner Key |
| `SHOPEE_REDIRECT_URI` | `https://alure-six.vercel.app/api/integrations/shopee/callback` |
| `SHOPEE_HOST` | Opcional. Deixe vazio para usar produção. |

7. Faça o Redeploy. No ALURE, abra **Configurações → Conectar Shopee** e entre com a **conta principal da loja**.

## 2. Mercado Livre

1. Em developers.mercadolivre.com.br, crie a aplicação com a conta da loja.
2. Cadastre como Redirect URI: `https://alure-six.vercel.app/api/integrations/mercado-livre/callback`
3. Cadastre na Vercel:

| Variável | Valor |
|---|---|
| `MELI_CLIENT_ID` | App ID |
| `MELI_CLIENT_SECRET` | Secret Key |
| `MELI_REDIRECT_URI` | `https://alure-six.vercel.app/api/integrations/mercado-livre/callback` |
| `MELI_PKCE` | `true` só se o PKCE estiver ativado no app. Se não estiver, deixe vazio. |

O prompt original fala em `MERCADOLIVRE_CLIENT_ID` e outros nomes parecidos, mas o sistema usa os nomes `MELI_*` desta tabela.

4. Faça o Redeploy. No ALURE, abra **Configurações → Conectar Mercado Livre**.

## 3. Sincronização automática diária (cron)

A Vercel chama `/api/cron/sync` todo dia às 09:00 UTC (06:00 em Brasília). Sem a variável abaixo, a chamada é recusada. O botão de sincronizar manualmente continua funcionando.

| Variável | Valor |
|---|---|
| `CRON_SECRET` | Texto aleatório longo. Gere com `openssl rand -base64 32`. |

## 4. Assistente de IA

O prompt pedia `OPENAI_API_KEY`. O assistente usa o **Vercel AI Gateway**, que já se autentica sozinho na Vercel. Por isso não precisa de chave.

- Na conta da Vercel do `alure-six`, abra **AI Gateway** e confira se há crédito ou um cartão cadastrado. Sem isso, o assistente responde com erro.
- Teste em **Assistente** perguntando "Como está a ALURE hoje?".

## 5. Dados do negócio (dentro do ALURE)

O motor não inventa números. Sem estes cadastros, ele avisa "dados insuficientes" em vez de recomendar.

1. **Regras de taxa** (Configurações → Regras de taxa): cadastre a comissão percentual, a taxa fixa e as taxas extras atuais do **Mercado Livre** e da **Shopee**, com a data de início. Sem regra, a margem não é calculada.
2. **Parâmetros do motor** (Configurações): confirme a **meta diária** (R$ 20.000), a margem mínima, a margem alvo e os dias sem venda para alerta.
3. **Produtos e custos** (Produtos → Novo): cadastre os SKUs com o custo e a data. Exemplo: 4906.303 com custo médio de R$ 65,86 (100 unidades a R$ 67 e 40 a R$ 63).
4. **Classificação** de cada produto: Motor de giro, Produto de margem, Alto ticket, etc.
5. **Memória estratégica** (Memória): registre as regras da casa. Exemplos: "4906.303 é motor de giro" e "Não reduzir preço durante teste de preço ativo".
6. **Testes em andamento** (Testes → Novo): registre os que já estão rodando, como o do 2060.C83 no Mercado Livre (R$ 211,87 → R$ 245,78, 7 dias).

## 6. Verificações depois de conectar os marketplaces

As integrações seguem a documentação oficial, mas ainda não foram testadas com as contas reais. Por isso as capacidades aparecem como **NEEDS VERIFICATION** em Configurações. Depois da primeira sincronização:

1. **Pedidos**: compare o faturamento e os pedidos de um dia no ALURE com o painel do marketplace ou do UpSeller.
2. **Anúncios**: confira se os anúncios ficaram vinculados ao produto certo. A ligação é feita pelo **SKU**, então o SKU do anúncio precisa ser igual ao cadastrado no ALURE.
3. **Visitas (Mercado Livre)**: confira se as visitas aparecem. A Shopee não fornece visitas por item pela API.
4. **Permissões da Shopee**: a categoria do app define quais APIs ficam liberadas. Anote quais aparecem no painel do app.
5. Me avise o resultado. Assim eu ligo o que ainda falta:
   - **Product Ads do Mercado Livre** (impressões, cliques, ACOS, ROAS);
   - promoções;
   - estoque;
   - custos de venda reais por item.

   Esses recursos ficaram desligados de propósito, até confirmarmos a API com a sua conta.

## 7. UpSeller (futuro)

Pergunte ao suporte do UpSeller se o **seu plano** tem API pública e qual documentação ela usa. Até lá, o adaptador fica como **NOT CONNECTED** e nada é construído em cima dele.

## 8. Conferir as variáveis que já existem

Confirme que estas variáveis estão no ambiente **Production** da Vercel:

- `DATABASE_URL`: já validada em `/status`
- `BETTER_AUTH_SECRET`
- `TOKEN_ENCRYPTION_KEY`: **não troque depois de conectar os marketplaces**. Os tokens salvos ficariam ilegíveis e seria preciso conectar tudo de novo.
- `ALURE_ALLOWED_EMAILS`: e-mails que podem entrar, separados por vírgula

## 9. Servidor (VPS), já concluído

- O PgBouncer, na porta 5433 com SSL, tem o banco `alure` e o usuário `alure` cadastrados.
- O backup da configuração anterior está em `/etc/pgbouncer/*.bak-alure`.
- A porta 5432 continua fechada para a internet. Não abra essa porta.
- A senha do root da VPS foi esquecida. Guarde a nova num gerenciador de senhas.
