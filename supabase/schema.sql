-- ═══════════════════════════════════════════════════════════════════
-- CyberRisk Intelligence Platform — Esquema de base de datos (Supabase)
-- ═══════════════════════════════════════════════════════════════════
-- Modelo multi-empresa (multi-tenant):
--   * Un usuario (auth.users) puede pertenecer a una o varias empresas.
--   * TODA fila de negocio lleva empresa_id, y Row Level Security (RLS)
--     garantiza que un usuario solo vea los datos de sus empresas.
--   * hallazgos y recomendaciones solo los escribe el backend (API Flask
--     con la llave service_role, que ignora RLS). El navegador solo lee.
--
-- Roles dentro de una empresa:
--   dueno  → todo, incluida la autorización de escaneo
--   admin  → gestiona activos y lanza escaneos
--   lector → solo consulta el dashboard
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────
-- 1. TABLAS
-- ───────────────────────────────────────────────────────────────────

-- Empresas cliente (PYMEs)
create table public.empresas (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (char_length(nombre) between 2 and 150),
  nit         text,
  sector      text,
  tamano      text check (tamano in ('micro', 'pequena', 'mediana', 'grande')),
  ciudad      text,
  creado_por  uuid not null default auth.uid() references auth.users(id),
  creado_en   timestamptz not null default now()
);

-- Usuarios que pertenecen a cada empresa y su rol
create table public.miembros (
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  rol         text not null default 'lector' check (rol in ('dueno', 'admin', 'lector')),
  creado_en   timestamptz not null default now(),
  primary key (empresa_id, user_id)
);

-- Registro legal: la empresa autoriza el escaneo de su infraestructura
create table public.autorizaciones (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references public.empresas(id) on delete cascade,
  user_id           uuid not null default auth.uid() references auth.users(id),
  version_terminos  text not null,          -- ej: 'v1.0-2026-10'
  aceptado_en       timestamptz not null default now(),
  revocado_en       timestamptz             -- null = vigente
);

-- Activos / equipos de la empresa (el agente los llenará en la Fase 3)
create table public.activos (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  nombre             text not null,         -- hostname o nombre descriptivo
  tipo               text not null default 'otro'
                     check (tipo in ('servidor', 'estacion', 'portatil', 'red', 'nube', 'otro')),
  sistema_operativo  text,
  version_so         text,
  criticidad         text not null default 'media'
                     check (criticidad in ('baja', 'media', 'alta', 'critica')),
  ultimo_escaneo     timestamptz,
  creado_en          timestamptz not null default now(),
  unique (empresa_id, nombre)
);

-- Cada análisis. origen = 'cuestionario' (hoy) o 'agente' (Fase 3)
create table public.escaneos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id) on delete cascade,
  activo_id      uuid references public.activos(id) on delete set null,
  origen         text not null default 'cuestionario' check (origen in ('cuestionario', 'agente')),
  estado         text not null default 'pendiente'
                 check (estado in ('pendiente', 'procesando', 'completado', 'error')),
  payload        jsonb not null,            -- lo recolectado (canonical_json)
  resumen        jsonb,                     -- KPIs calculados por la API (tier máx., score, etc.)
  error          text,
  creado_por     uuid default auth.uid() references auth.users(id),
  creado_en      timestamptz not null default now(),
  completado_en  timestamptz
);

-- Resultado del modelo: un escenario de riesgo por fila
create table public.hallazgos (
  id          uuid primary key default gen_random_uuid(),
  escaneo_id  uuid not null references public.escaneos(id) on delete cascade,
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  activo_id   uuid references public.activos(id) on delete set null,
  vendor      text,
  producto    text,
  cwe         text,
  severidad   text,
  tier        smallint check (tier between 1 and 5),
  score       numeric(5, 4),
  detalle     jsonb,                        -- attack / impact completos del modelo
  creado_en   timestamptz not null default now()
);

-- Qué hacer con cada hallazgo (reglas hoy, agente de IA en Fase 4)
create table public.recomendaciones (
  id           uuid primary key default gen_random_uuid(),
  hallazgo_id  uuid not null references public.hallazgos(id) on delete cascade,
  empresa_id   uuid not null references public.empresas(id) on delete cascade,
  titulo       text not null,
  descripcion  text,
  prioridad    smallint not null default 3 check (prioridad between 1 and 5),
  generada_por text not null default 'reglas' check (generada_por in ('reglas', 'ia')),
  estado       text not null default 'pendiente'
               check (estado in ('pendiente', 'en_progreso', 'resuelta', 'descartada')),
  creado_en    timestamptz not null default now()
);

-- Agentes instalados (.exe). Se crea ahora para no migrar después.
-- Solo se guarda el HASH del token, nunca el token en claro.
create table public.agentes (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references public.empresas(id) on delete cascade,
  activo_id        uuid references public.activos(id) on delete set null,
  nombre           text not null,
  plataforma       text check (plataforma in ('windows', 'linux', 'macos')),
  version          text,
  token_hash       text not null unique,
  ultimo_contacto  timestamptz,
  revocado         boolean not null default false,
  creado_en        timestamptz not null default now()
);


-- ───────────────────────────────────────────────────────────────────
-- 2. ÍNDICES (consultas por empresa y por escaneo)
-- ───────────────────────────────────────────────────────────────────
create index on public.miembros        (user_id);
create index on public.autorizaciones  (empresa_id);
create index on public.activos         (empresa_id);
create index on public.escaneos        (empresa_id, creado_en desc);
create index on public.escaneos        (activo_id);
create index on public.hallazgos       (escaneo_id);
create index on public.hallazgos       (empresa_id);
create index on public.hallazgos       (activo_id);
create index on public.recomendaciones (hallazgo_id);
create index on public.recomendaciones (empresa_id);
create index on public.agentes         (empresa_id);
create index on public.agentes         (activo_id);
create index on public.empresas        (creado_por);
create index on public.autorizaciones  (user_id);
create index on public.escaneos        (creado_por);


-- ───────────────────────────────────────────────────────────────────
-- 3. FUNCIONES DE APOYO PARA RLS
--    security definer: consultan "miembros" sin disparar su propio RLS
--    (evita recursión infinita). search_path vacío por seguridad.
--    Viven en el esquema "privado", que la API REST no expone, para que
--    nadie pueda llamarlas como /rest/v1/rpc/...
-- ───────────────────────────────────────────────────────────────────
create schema if not exists privado;
revoke all on schema privado from public, anon;
grant usage on schema privado to authenticated;

create or replace function privado.es_miembro(p_empresa uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.miembros
    where empresa_id = p_empresa and user_id = (select auth.uid())
  );
$$;

create or replace function privado.tiene_rol(p_empresa uuid, p_roles text[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.miembros
    where empresa_id = p_empresa
      and user_id = (select auth.uid())
      and rol = any (p_roles)
  );
$$;

-- ¿La empresa tiene una autorización de escaneo vigente?
create or replace function privado.escaneo_autorizado(p_empresa uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.autorizaciones
    where empresa_id = p_empresa and revocado_en is null
  );
$$;

-- Al crear una empresa, quien la crea queda como "dueno" automáticamente
create or replace function privado.agregar_dueno()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.miembros (empresa_id, user_id, rol)
  values (new.id, new.creado_por, 'dueno');
  return new;
end;
$$;

create trigger trg_empresas_agregar_dueno
  after insert on public.empresas
  for each row execute function privado.agregar_dueno();

-- Solo los usuarios con sesión las ejecutan (al evaluar las políticas)
revoke execute on all functions in schema privado from public, anon, authenticated;
grant  execute on function privado.es_miembro(uuid)         to authenticated;
grant  execute on function privado.tiene_rol(uuid, text[])  to authenticated;
grant  execute on function privado.escaneo_autorizado(uuid) to authenticated;


-- ───────────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY
-- ───────────────────────────────────────────────────────────────────
alter table public.empresas        enable row level security;
alter table public.miembros        enable row level security;
alter table public.autorizaciones  enable row level security;
alter table public.activos         enable row level security;
alter table public.escaneos        enable row level security;
alter table public.hallazgos       enable row level security;
alter table public.recomendaciones enable row level security;
alter table public.agentes         enable row level security;

-- Los visitantes sin sesión (anon) no tocan ninguna tabla
revoke all on all tables in schema public from anon;

-- ── empresas ──
create policy "empresas: ver las mías" on public.empresas
  for select to authenticated using ((select privado.es_miembro(id)) or creado_por = (select auth.uid()));
create policy "empresas: crear" on public.empresas
  for insert to authenticated with check (creado_por = (select auth.uid()));
create policy "empresas: editar dueno/admin" on public.empresas
  for update to authenticated using ((select privado.tiene_rol(id, array['dueno','admin'])))
  with check ((select privado.tiene_rol(id, array['dueno','admin'])));
create policy "empresas: borrar dueno" on public.empresas
  for delete to authenticated using ((select privado.tiene_rol(id, array['dueno'])));

-- ── miembros ── (invitar usuarios queda para una fase posterior)
create policy "miembros: ver los de mi empresa" on public.miembros
  for select to authenticated using ((select privado.es_miembro(empresa_id)));
-- Una política por acción (no "for all") para que el SELECT evalúe una sola regla
create policy "miembros: agregar dueno" on public.miembros
  for insert to authenticated with check ((select privado.tiene_rol(empresa_id, array['dueno'])));
create policy "miembros: editar dueno" on public.miembros
  for update to authenticated using ((select privado.tiene_rol(empresa_id, array['dueno'])))
  with check ((select privado.tiene_rol(empresa_id, array['dueno'])));
create policy "miembros: quitar dueno" on public.miembros
  for delete to authenticated using ((select privado.tiene_rol(empresa_id, array['dueno'])));

-- ── autorizaciones ──
create policy "autorizaciones: ver" on public.autorizaciones
  for select to authenticated using ((select privado.es_miembro(empresa_id)));
create policy "autorizaciones: otorgar dueno" on public.autorizaciones
  for insert to authenticated with check (
    user_id = (select auth.uid()) and (select privado.tiene_rol(empresa_id, array['dueno'])));
create policy "autorizaciones: revocar dueno" on public.autorizaciones
  for update to authenticated using ((select privado.tiene_rol(empresa_id, array['dueno'])))
  with check ((select privado.tiene_rol(empresa_id, array['dueno'])));
-- Solo se puede modificar la fecha de revocación, no reescribir lo aceptado
revoke update on public.autorizaciones from authenticated;
grant  update (revocado_en) on public.autorizaciones to authenticated;

-- ── activos ──
create policy "activos: ver" on public.activos
  for select to authenticated using ((select privado.es_miembro(empresa_id)));
create policy "activos: crear dueno/admin" on public.activos
  for insert to authenticated with check ((select privado.tiene_rol(empresa_id, array['dueno','admin'])));
create policy "activos: editar dueno/admin" on public.activos
  for update to authenticated using ((select privado.tiene_rol(empresa_id, array['dueno','admin'])))
  with check ((select privado.tiene_rol(empresa_id, array['dueno','admin'])));
create policy "activos: borrar dueno/admin" on public.activos
  for delete to authenticated using ((select privado.tiene_rol(empresa_id, array['dueno','admin'])));

-- ── escaneos ──
create policy "escaneos: ver" on public.escaneos
  for select to authenticated using ((select privado.es_miembro(empresa_id)));
-- Solo se puede crear un escaneo si la empresa lo autorizó
create policy "escaneos: crear dueno/admin con autorización" on public.escaneos
  for insert to authenticated with check (
    creado_por = (select auth.uid())
    and estado = 'pendiente'
    and (select privado.tiene_rol(empresa_id, array['dueno','admin']))
    and (select privado.escaneo_autorizado(empresa_id)));
-- No hay política de update: el estado y el resumen solo los cambia la API

-- ── hallazgos ── solo lectura para el usuario
create policy "hallazgos: ver" on public.hallazgos
  for select to authenticated using ((select privado.es_miembro(empresa_id)));

-- ── recomendaciones ── lectura + marcar estado (resuelta, etc.)
create policy "recomendaciones: ver" on public.recomendaciones
  for select to authenticated using ((select privado.es_miembro(empresa_id)));
create policy "recomendaciones: cambiar estado dueno/admin" on public.recomendaciones
  for update to authenticated using ((select privado.tiene_rol(empresa_id, array['dueno','admin'])))
  with check ((select privado.tiene_rol(empresa_id, array['dueno','admin'])));
revoke update on public.recomendaciones from authenticated;
grant  update (estado) on public.recomendaciones to authenticated;

-- ── agentes ── ver y revocar (la creación la hará la API en la Fase 3)
create policy "agentes: ver dueno/admin" on public.agentes
  for select to authenticated using ((select privado.tiene_rol(empresa_id, array['dueno','admin'])));
create policy "agentes: revocar dueno/admin" on public.agentes
  for update to authenticated using ((select privado.tiene_rol(empresa_id, array['dueno','admin'])))
  with check ((select privado.tiene_rol(empresa_id, array['dueno','admin'])));
revoke update on public.agentes from authenticated;
grant  update (revocado) on public.agentes to authenticated;
-- El hash del token nunca se expone al navegador
revoke select on public.agentes from authenticated;
grant  select (id, empresa_id, activo_id, nombre, plataforma, version,
               ultimo_contacto, revocado, creado_en) on public.agentes to authenticated;


-- ───────────────────────────────────────────────────────────────────
-- 5. SOPORTE PARA EL AGENTE INSTALABLE (migración "soporte_agente")
-- ───────────────────────────────────────────────────────────────────
-- Activos: el cliente indica si el equipo está expuesto a internet
alter table public.activos
  add column if not exists expuesto_internet boolean not null default false;

-- Escaneos: inventario crudo enviado por el agente (lo que el cliente revisó y aprobó)
alter table public.escaneos
  add column if not exists inventario jsonb;

-- Agentes: enlace con código de un solo uso.
-- El dashboard crea el agente con un código corto (hash + vencimiento);
-- el .exe lo canjea UNA vez por su token permanente (también solo hash).
alter table public.agentes
  add column if not exists codigo_hash   text unique,
  add column if not exists codigo_expira timestamptz,
  add column if not exists enlazado_en   timestamptz;
alter table public.agentes alter column token_hash set default null;
alter table public.agentes alter column token_hash drop not null;

-- El navegador puede ver estos campos nuevos (nunca los hash)
grant select (codigo_expira, enlazado_en) on public.agentes to authenticated;


-- ───────────────────────────────────────────────────────────────────
-- 6. NOMBRE REAL DE LA TECNOLOGÍA EN HALLAZGOS (migración "hallazgos_tecnologia")
-- ───────────────────────────────────────────────────────────────────
-- El modelo devuelve solo la categoría en "producto" (ej: "Browser");
-- la API guarda además la tecnología real (ej: "Google Chrome").
alter table public.hallazgos
  add column if not exists tecnologia text,
  add column if not exists categoria  text;
