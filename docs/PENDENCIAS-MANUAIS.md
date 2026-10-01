# Pendências manuais do ALURE OS

Esta lista reúne o que só você pode fazer, fora do código. O sistema já funciona sem esses itens: enquanto uma credencial falta, o botão do marketplace correspondente avisa que a configuração está pendente e nada quebra.

Todas as variáveis são cadastradas na Vercel, no projeto `alure-six`, em **Settings → Environment Variables** (ambiente Production). Depois de salvar, faça o **Redeploy**.

---

## 1. Shopee

**Situação:** o cadastro no Open Platform não terminou. O erro `code 57 / verify code fail` indica que o código de verificação enviado por e-mail estava errado ou expirado.

1. Em open.shopee.com, termine o cadastro pedindo um **novo código**. Use o código mais recente e digite-o logo, porque ele expira em poucos minutos.
2. Escolha o tipo de desenvolvedor **vendedor que integra a própria loja** (Registered Business Seller / Seller In-house System). Não escolha Third-party Partner / ISV.
3. Aguarde a aprovação, que pode levar alguns dias.
4. Em **App List → Create App**, crie um app do tipo **Seller In-house System**.
5. Cadastre como Redirect URL:
   `https://alure-six.vercel.app/api/integrations/shopee/callback`
6. Copie o **Partner ID** e a **Partner Key** de **produção (Live)** e cadastre na Vercel:

| Variável | Valor |
|---|---|
| `SHOPEE_PARTNER_ID` | Partner ID (só números) |
| `SHOPEE_PARTNER_KEY` | Partner Key |
| `SHOPEE_REDIRECT_URI` | `https://alure-six.vercel.app/api/integrations/shopee/callback` |
| `SHOPEE_HOST` | Opcional. Deixe vazio para usar produção. |

7. Faça o Redeploy. No ALURE, abra **Configurações → Conectar Shopee** e entre com a **conta principal da loja**.

## 2. Mercado Livre

1. Em developers.mercadolivre.com.br, crie a aplicação.
2. Cadastre como Redirect URI:
   `https://alure-six.vercel.app/api/integrations/mercado-livre/callback`
3. Cadastre na Vercel:

| Variável | Valor |
|---|---|
| `MELI_CLIENT_ID` | App ID |
| `MELI_CLIENT_SECRET` | Secret Key |
| `MELI_REDIRECT_URI` | `https://alure-six.vercel.app/api/integrations/mercado-livre/callback` |
| `MELI_PKCE` | `true` somente se o PKCE estiver ativado no app. Se não estiver, deixe vazio. |

4. Faça o Redeploy. No ALURE, abra **Configurações → Conectar Mercado Livre**.

## 3. Sincronização automática diária (cron)

A Vercel chama `/api/cron/sync` todo dia às 09:00 UTC, que corresponde a 06:00 no horário de Brasília. Sem a variável abaixo, a chamada é recusada e a sincronização automática não roda. O botão de sincronizar manualmente continua funcionando.

| Variável | Valor |
|---|---|
| `CRON_SECRET` | Texto aleatório longo. Gere com `openssl rand -base64 32`. |

## 4. Conferir as variáveis que já existem

Confirme que estas variáveis estão no ambiente **Production** da Vercel:

- `DATABASE_URL`: já validada em `/status`
- `BETTER_AUTH_SECRET`
- `TOKEN_ENCRYPTION_KEY`: **não troque depois de conectar os marketplaces**. Os tokens salvos ficariam ilegíveis e seria preciso conectar tudo de novo.
- `ALURE_ALLOWED_EMAILS`: e-mails que podem entrar, separados por vírgula

## 5. Servidor (VPS), já concluído

- O PgBouncer, na porta 5433 com SSL, tem o banco `alure` e o usuário `alure` cadastrados.
- O backup da configuração anterior está em `/etc/pgbouncer/*.bak-alure`.
- A porta 5432 continua fechada para a internet. Não abra essa porta.
