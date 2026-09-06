-- =========================================================
-- سیستم نظارت پروژه‌ها
-- Supabase SQL / PostgreSQL
-- =========================================================

create extension if not exists pgcrypto;

-- ---------- Profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role text not null default 'expert' check (role in ('manager','expert')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Projects ----------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  assigned_to uuid references public.profiles(id) on delete set null,
  status text not null default 'active'
    check (status in ('active','waiting','stopped','done')),
  latest_update text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Updates ----------
create table if not exists public.project_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  content text not null check (char_length(trim(content)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists projects_updated_at_idx on public.projects(updated_at desc);
create index if not exists projects_assigned_to_idx on public.projects(assigned_to);
create index if not exists updates_project_id_idx on public.project_updates(project_id, created_at desc);

-- ---------- Helper: manager check ----------
create or replace function public.is_manager()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'manager'
      and active = true
  );
$$;

revoke all on function public.is_manager() from public;
grant execute on function public.is_manager() to authenticated;

-- ---------- Automatic profile creation ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    'expert'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- ---------- Update project timestamp/latest text ----------
create or replace function public.touch_project_from_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.projects
  set
    updated_at = new.created_at,
    latest_update = new.content
  where id = new.project_id;
  return new;
end;
$$;

drop trigger if exists after_project_update_insert on public.project_updates;
create trigger after_project_update_insert
after insert on public.project_updates
for each row execute procedure public.touch_project_from_update();

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_updates enable row level security;

-- Profiles
drop policy if exists "profiles_select_self_or_manager" on public.profiles;
create policy "profiles_select_self_or_manager"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_manager());

drop policy if exists "profiles_manager_update" on public.profiles;
create policy "profiles_manager_update"
on public.profiles for update
to authenticated
using (public.is_manager())
with check (public.is_manager());

-- Projects
drop policy if exists "projects_select_allowed" on public.projects;
create policy "projects_select_allowed"
on public.projects for select
to authenticated
using (public.is_manager() or assigned_to = auth.uid());

drop policy if exists "projects_manager_insert" on public.projects;
create policy "projects_manager_insert"
on public.projects for insert
to authenticated
with check (public.is_manager());

drop policy if exists "projects_manager_update" on public.projects;
create policy "projects_manager_update"
on public.projects for update
to authenticated
using (public.is_manager())
with check (public.is_manager());

drop policy if exists "projects_manager_delete" on public.projects;
create policy "projects_manager_delete"
on public.projects for delete
to authenticated
using (public.is_manager());

-- Updates
drop policy if exists "updates_select_allowed" on public.project_updates;
create policy "updates_select_allowed"
on public.project_updates for select
to authenticated
using (
  public.is_manager()
  or exists (
    select 1 from public.projects p
    where p.id = project_updates.project_id
      and p.assigned_to = auth.uid()
  )
);

drop policy if exists "updates_insert_allowed" on public.project_updates;
create policy "updates_insert_allowed"
on public.project_updates for insert
to authenticated
with check (
  user_id = auth.uid()
  and (
    public.is_manager()
    or exists (
      select 1 from public.projects p
      where p.id = project_updates.project_id
        and p.assigned_to = auth.uid()
    )
  )
);

-- No update/delete policy for project_updates:
-- intentionally immutable. A registered update cannot be edited or deleted
-- from the application.

-- ---------- Realtime ----------
do $$
begin
  alter publication supabase_realtime add table public.projects;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.project_updates;
exception when duplicate_object then null;
end $$;

-- =========================================================
-- FIRST TWO MANAGERS
--
-- 1) ابتدا دو کاربر را در Authentication > Users ایجاد کنید.
-- 2) سپس UUID آنها را جایگزین کنید و این دو دستور را اجرا کنید:
--
-- update public.profiles
-- set role = 'manager', full_name = 'مدیر اول'
-- where id = 'UUID-MANAGER-1';
--
-- update public.profiles
-- set role = 'manager', full_name = 'مدیر دوم'
-- where id = 'UUID-MANAGER-2';
--
-- برای کارشناسان فقط کاربر را در Authentication بسازید؛
-- trigger خودش profile با role=expert ایجاد می‌کند.
-- =========================================================
