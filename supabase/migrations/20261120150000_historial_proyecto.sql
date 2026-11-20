-- Historial del proyecto (Vicky, 20/11/2026): lo que pasó, con fecha y quién, separado de los comentarios y las tareas.
-- Lo escriben triggers sobre proyectos y desarrollos, así cubre todas las funciones que cambian el estado (enviar,
-- aprobar, arrancar, deployar, finalizar, detener, reanudar, no aceptar) sin tocar cada una.
-- Las fechas previstas que cambian quedan registradas como «prevista»: nunca pisan lo que ya ocurrió.
-- Arranca con lo que ya hay: las fechas de cada proyecto y los comentarios de Detenido y No aceptado.
set role crm_giwa_dev;

create table if not exists crm_giwa.historial_proyecto (
  id            bigint generated always as identity primary key,
  proyecto_id   text not null references crm_giwa.proyectos(id) on delete cascade,
  desarrollo_id text,
  evento        text not null,
  fecha         date not null default crm_giwa.hoy(),
  prevista      boolean not null default false,
  detalle       text,
  quien         text,
  creado        timestamptz not null default now()
);
create index if not exists historial_proyecto_pid on crm_giwa.historial_proyecto (proyecto_id, fecha desc, id desc);
comment on table crm_giwa.historial_proyecto is 'Recorrido del proyecto: estados, detenciones y fechas previstas cambiadas (20/11/2026)';
alter table crm_giwa.historial_proyecto enable row level security;
drop policy if exists equipo on crm_giwa.historial_proyecto;
create policy equipo on crm_giwa.historial_proyecto for all using ((select crm_giwa.es_equipo()));
grant select, insert on crm_giwa.historial_proyecto to authenticated;

create or replace function crm_giwa._hist(pid text, did text, ev text, det text default null, prev boolean default false, f date default null)
returns void language sql as $$
  insert into crm_giwa.historial_proyecto (proyecto_id, desarrollo_id, evento, fecha, prevista, detalle, quien)
  values (pid, did, ev, coalesce(f, crm_giwa.hoy()), prev, det, nullif(crm_giwa.mi_mail(), ''));
$$;

create or replace function crm_giwa._hist_proyecto() returns trigger language plpgsql as $$
declare c text;
begin
  if tg_op = 'INSERT' then
    perform crm_giwa._hist(new.id, null, 'Creado', null);
    return new;
  end if;
  if new.estado_id is distinct from old.estado_id then
    c := crm_giwa.norm(new.estado_id);
    perform crm_giwa._hist(new.id, null,
      case when c ~ 'negoc' then 'Propuesta enviada' when c ~ 'aprob' then 'Aprobado' when c ~ 'activ' then 'Arrancó'
           when c ~ 'finaliz' then 'Finalizado' when c ~ 'rechaz' then 'No aceptado' else 'Pasó a ' || new.estado_id end,
      'De ' || coalesce(old.estado_id, '—') || ' a ' || new.estado_id);
  end if;
  if new.detenido is distinct from old.detenido then
    perform crm_giwa._hist(new.id, null, case when new.detenido then 'Detenido' else 'Reanudado' end, null);
  end if;
  if new.fecha_cierre_probable is distinct from old.fecha_cierre_probable and old.fecha_aprobacion is null then
    perform crm_giwa._hist(new.id, null, 'Aprobación prevista', coalesce(to_char(old.fecha_cierre_probable, 'DD/MM/YYYY'), '—') || ' → ' ||
      coalesce(to_char(new.fecha_cierre_probable, 'DD/MM/YYYY'), '—'), true);
  end if;
  return new;
end $$;

create or replace function crm_giwa._hist_desarrollo() returns trigger language plpgsql as $$
declare c text; t text := coalesce(new.titulo, new.id);
begin
  if tg_op = 'INSERT' then
    perform crm_giwa._hist(new.proyecto_id, new.id, 'Desarrollo agregado', t || ' · ' || coalesce(new.estado_id, ''));
    return new;
  end if;
  if new.estado_id is distinct from old.estado_id then
    c := crm_giwa.norm(new.estado_id);
    perform crm_giwa._hist(new.proyecto_id, new.id,
      case when c ~ 'aprob' then 'Aprobado' when c ~ 'curso' then 'Arrancó' when c ~ 'garant' then 'Entregado'
           when c ~ 'finaliz' then 'Finalizado' when c ~ 'rechaz' then 'No aceptado' else 'Pasó a ' || new.estado_id end || ' · ' || t,
      'De ' || coalesce(old.estado_id, '—') || ' a ' || new.estado_id);
  end if;
  if new.detenido is distinct from old.detenido then
    perform crm_giwa._hist(new.proyecto_id, new.id, case when new.detenido then 'Detenido' else 'Reanudado' end || ' · ' || t, null);
  end if;
  -- inicio y fin previstos (antes de arrancar / de entregar): el cambio queda como previsto
  if new.fecha_inicio is distinct from old.fecha_inicio and crm_giwa.norm(coalesce(old.estado_id, '')) !~ '(curso|garant|finaliz)' then
    perform crm_giwa._hist(new.proyecto_id, new.id, 'Inicio previsto · ' || t, coalesce(to_char(old.fecha_inicio, 'DD/MM/YYYY'), '—') || ' → ' || coalesce(to_char(new.fecha_inicio, 'DD/MM/YYYY'), '—'), true);
  end if;
  if new.fecha_fin is distinct from old.fecha_fin and crm_giwa.norm(coalesce(old.estado_id, '')) !~ '(garant|finaliz)' then
    perform crm_giwa._hist(new.proyecto_id, new.id, 'Fin previsto · ' || t, coalesce(to_char(old.fecha_fin, 'DD/MM/YYYY'), '—') || ' → ' || coalesce(to_char(new.fecha_fin, 'DD/MM/YYYY'), '—'), true);
  end if;
  return new;
end $$;

drop trigger if exists historial on crm_giwa.proyectos;
create trigger historial after insert or update on crm_giwa.proyectos for each row execute function crm_giwa._hist_proyecto();
drop trigger if exists historial on crm_giwa.desarrollos;
create trigger historial after insert or update on crm_giwa.desarrollos for each row execute function crm_giwa._hist_desarrollo();

-- Lo que ya pasó, desde las fechas que hay y los comentarios de Detenido / No aceptado
insert into crm_giwa.historial_proyecto (proyecto_id, evento, fecha, detalle, quien)
select id, ev, f, 'Cargado desde los datos existentes', null from crm_giwa.proyectos p,
  lateral (values ('Creado', p.creado::date), ('Propuesta enviada', p.fecha_propuesta_enviada), ('Aprobado', p.fecha_aprobacion),
                  ('Arrancó', p.fecha_inicio), ('Finalizado', p.fecha_finalizado)) v(ev, f)
where f is not null and not exists (select 1 from crm_giwa.historial_proyecto h where h.proyecto_id = p.id);
insert into crm_giwa.historial_proyecto (proyecto_id, evento, fecha, detalle, quien)
select split_part(c.proyecto_id, ',', 1), case when c.texto ~* '^detenido' then 'Detenido' else 'No aceptado' end, coalesce(c.fecha::date, c.creado::date), c.texto, c.creador
from crm_giwa.comentarios c
where c.texto ~* '^(detenido|no aceptado)' and coalesce(c.proyecto_id, '') <> ''
  and exists (select 1 from crm_giwa.proyectos p where p.id = split_part(c.proyecto_id, ',', 1));

reset role;
