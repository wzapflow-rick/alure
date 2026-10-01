import type { DbStatus } from '@/lib/db'

const COPY: Record<Exclude<DbStatus, 'ready'>, { title: string; body: string }> = {
  missing_env: {
    title: 'Banco de dados não configurado',
    body: 'Adicione a variável DATABASE_URL (string de conexão do seu PostgreSQL) em Vars nas configurações do projeto.',
  },
  unreachable: {
    title: 'Não foi possível conectar ao PostgreSQL',
    body: 'A DATABASE_URL está definida, mas o servidor não respondeu. Verifique host, porta, usuário, senha, SSL e se o servidor aceita conexões externas.',
  },
  missing_schema: {
    title: 'Schema ainda não aplicado',
    body: 'A conexão funciona, mas as tabelas do ALURE OS não existem. Execute o script db/001_schema.sql no Query Tool do pgAdmin.',
  },
}

export function SetupRequired({ status }: { status: Exclude<DbStatus, 'ready'> }) {
  const copy = COPY[status]
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="flex max-w-lg flex-col gap-4 rounded-lg border border-border bg-surface p-8">
        <p className="font-mono text-xs uppercase tracking-widest text-attention">Configuração necessária</p>
        <h1 className="text-xl font-semibold text-balance">{copy.title}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{copy.body}</p>
        <ol className="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
          <li>1. Definir DATABASE_URL e BETTER_AUTH_SECRET.</li>
          <li>2. Executar db/001_schema.sql no pgAdmin.</li>
          <li>3. Recarregar esta página e criar o primeiro usuário.</li>
        </ol>
      </div>
    </main>
  )
}
