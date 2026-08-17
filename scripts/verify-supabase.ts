#!/usr/bin/env tsx
/**
 * scripts/verify-supabase.ts — Health check del setup de Supabase (Feature 001)
 *
 * Valida:
 *   (a) Conexión/API:       query a la tabla `books` (404/RLS = OK, error de red = FAIL)
 *   (b) Auth:               endpoint /auth/v1/health + supabase.auth.getSession()
 *   (c) pgvector:           SELECT extversion FROM pg_extension WHERE extname='vector'
 *                           (requiere SUPABASE_DB_URL — conexión SQL directa con password)
 *
 * Requisitos:
 *   - Copiar `.env.example` → `.env.local` y rellenar credenciales reales.
 *   - Dependencias: `npm install` (raíz del repo).
 *
 * Uso:
 *   npm run verify:supabase        # (equivale a: npx tsx scripts/verify-supabase.ts)
 *
 * Exit code: 0 = todo OK · 1 = fallo (con mensaje descriptivo)
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const { Client } = pg;


/* ------------------------------------------------------------------ */
/* Carga de variables de entorno (.env.local si existe)               */
/* ------------------------------------------------------------------ */
const envLocalPath = resolve(process.cwd(), '.env.local');

function loadEnvFile(path: string): void {
  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

if (existsSync(envLocalPath)) {
  loadEnvFile(envLocalPath);
  console.log(`> Variables cargadas desde: .env.local`);
} else {
  console.warn('> Aviso: no existe .env.local. Usando variables del entorno.');
}

/* ------------------------------------------------------------------ */
/* Configuración                                                       */
/* ------------------------------------------------------------------ */
const REQUIRED = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const;
const OPTIONAL = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_JWT_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'SUPABASE_DB_URL',
] as const;

const missing = REQUIRED.filter((k) => !process.env[k]);

if (missing.length > 0) {
  console.error(`✗ Faltan variables requeridas: ${missing.join(', ')}`);
  console.error('  → Copia .env.example a .env.local y rellena los valores reales.');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/+$/, '');
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let failures = 0;
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const fail = (msg: string) => {
  console.error(`  ✗ ${msg}`);
  failures += 1;
};
const warn = (msg: string) => console.warn(`  ⚠ ${msg}`);

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */
async function testConnection(supabase: ReturnType<typeof createClient>): Promise<void> {
  console.log('\n[1/3] Conexión / API (PostgREST)');
  const { error } = await supabase.from('books').select('count', { count: 'exact', head: true }).limit(1);

  if (!error) {
    ok('Conexión OK — tabla `books` accesible.');
  } else if ('code' in error && error.code === 'PGRST205') {
    // 404: tabla aún no creada (esperado antes de feature 002) → la API responde correctamente.
    ok('Conexión OK — API responde (tabla `books` aún no existe: esperado pre-migración 002).');
  } else if ('code' in error && error.code) {
    fail(`Conexión: error PostgREST ${error.code}: ${error.message}`);
  } else if ('code' in error && /fetch|network|ECONN|ENOTFOUND/i.test(error.message)) {
    // Sin código + mensaje de red → error de red / DNS / TLS.
    fail(`Conexión: error de red o URL inválida — ${error.message}`);
  } else {
    fail(`Conexión: error inesperado — ${error.message}`);
  }
}

async function testAuth(supabase: ReturnType<typeof createClient>): Promise<void> {
  console.log('\n[2/3] Autenticación (GoTrue)');
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      ok(`Auth endpoint /auth/v1/health responde (HTTP ${res.status}).`);
    } else {
      fail(`Auth health: HTTP ${res.status}.`);
    }
  } catch (err) {
    fail(`Auth health: no se pudo alcanzar — ${(err as Error).message}`);
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    fail(`getSession: ${error.message}`);
  } else {
    ok(`getSession OK — session=${data.session ? 'activa' : 'null (esperado sin login)'}.`);
  }
}
async function testPgvector(): Promise<void> {
  console.log('\n[3/3] Extensión pgvector');
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    warn('SUPABASE_DB_URL no definida → SKIP verificación SQL de pgvector.');
    warn('  Opcional: añade SUPABASE_DB_URL (postgresql://postgres.<ref>:<password>@...:5432/postgres) a .env.local.');
    warn('  Alternativa: verifica en Dashboard → SQL Editor → SELECT * FROM pg_extension WHERE extname = \'vector\';');
    return;
  }

  const client = new Client({ connectionString: dbUrl, connectionTimeoutMillis: 10_000 });
  try {
    await client.connect();
    const { rows } = await client.query<{ extversion: string }>(
      `SELECT extversion FROM pg_extension WHERE extname = 'vector'`,
    );
    if (rows.length === 0) {
      fail('pgvector: extensión "vector" NO instalada.');
      return;
    }
    const version = rows[0].extversion;
    const [major, minor] = version.split('.').map(Number);
    if (major > 0 || (major === 0 && minor >= 7)) {
      ok(`pgvector instalado — extversion=${version} (≥ 0.7, HNSW disponible).`);
    } else {
      fail(`pgvector extversion=${version} < 0.7 → HNSW NO disponible.`);
    }
  } catch (err) {
    fail(`pgvector: falló la conexión SQL — ${(err as Error).message}`);
  } finally {
    await client.end().catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */
async function main(): Promise<void> {
  console.log(`\nVerificando Supabase project: ${url}\n`);

  let supabase: ReturnType<typeof createClient>;
  try {
    supabase = createClient(url, anonKey, { auth: { persistSession: false } });
  } catch (err) {
    console.error(`✗ No se pudo inicializar el cliente: ${(err as Error).message}`);
    process.exit(1);
  }

  await testConnection(supabase);
  await testAuth(supabase);
  await testPgvector();

  console.log('\n------------------------------------------');
  if (failures === 0) {
    console.log('RESULTADO: TODO OK ✅ (exit 0)');
    process.exit(0);
  }
  console.error(`RESULTADO: ${failures} comprobación(es) fallida(s) ❌ (exit 1)`);
  process.exit(1);
}

main().catch((err) => {
  console.error(`Error inesperado: ${(err as Error).message}`);
  process.exit(1);
});