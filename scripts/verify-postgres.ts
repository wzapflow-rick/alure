// Run: pnpm verify:db  (requires DATABASE_URL in the environment)
import { closePool, runPostgresSelfTest } from '@/lib/selftest/postgres'

async function main() {
  const report = await runPostgresSelfTest(null)
  for (const s of report.steps) console.log(`${s.ok ? 'PASS' : 'FAIL'}  ${s.name}\n      ${s.detail}`)
  console.log(`\n${report.ok ? 'OK' : 'FALHOU'} em ${report.durationMs} ms (tag ${report.tag})`)
  await closePool()
  process.exit(report.ok ? 0 : 1)
}

main().catch(async (error) => {
  console.error(error)
  await closePool().catch(() => {})
  process.exit(1)
})
