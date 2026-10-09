-- 020: limite de tentativas de login e limpeza de sessões vencidas
CREATE TABLE IF NOT EXISTS auth_rate_limit (
  key          text PRIMARY KEY,
  count        integer NOT NULL DEFAULT 0,
  last_request bigint  NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_rate_limit_last_idx ON auth_rate_limit (last_request);

-- Sessões vencidas só ocupam espaço e deixam a consulta de sessão mais lenta
CREATE INDEX IF NOT EXISTS session_expires_idx ON "session" ("expiresAt");
DELETE FROM "session" WHERE "expiresAt" < now();
DELETE FROM verification WHERE "expiresAt" < now();

-- Conferência
SELECT to_regclass('public.auth_rate_limit') AS tabela_limite,
       (SELECT count(*) FROM "session") AS sessoes_ativas,
       (SELECT count(*) FROM "user")    AS usuarios;
