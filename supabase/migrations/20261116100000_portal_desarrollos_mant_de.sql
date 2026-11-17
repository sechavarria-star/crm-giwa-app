-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Portal: «Nuevo ticket» muestra cada sistema con su mantenimiento · 16/11/2026
-- ──────────────────────────────────────────────────────────────────────
-- Pantalla 2 aprobada (06/11/2026): las opciones de «Sobre qué» son los desarrollos del
-- cliente y, si tienen un mantenimiento mensual vigente, lo traen con ellos. Para saberlo
-- el portal necesita `mant_de` (de qué desarrollo es cada mantenimiento o línea de soporte).
-- Único cambio respecto de soporte_base: se agrega 'mant_de' a cada desarrollo.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa.portal_inicio(como text default null)
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare emp text := crm_giwa._portal_empresa(como, false); se crm_giwa.soporte_empresas;
begin
  select * into se from crm_giwa.soporte_empresas where empresa_id = emp;
  return jsonb_build_object(
    'yo', jsonb_build_object('mail', crm_giwa.mi_mail(),
            'nombre', coalesce((select nullif(trim(coalesce(c.nombre, '') || ' ' || coalesce(c.apellido, '')), '') from crm_giwa.contactos c
                                 where crm_giwa.norm_mail(c.email) = crm_giwa.mi_mail() limit 1), crm_giwa.mi_mail()),
            'como', como is not null),
    'empresa', (select jsonb_build_object('id', e.id, 'nombre', e.nombre, 'logo', e.logo, 'mostrar_horas', coalesce(se.mostrar_horas, false))
                  from crm_giwa.empresas e where e.id = emp),
    'desarrollos', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'proyecto_id', d.proyecto_id, 'proyecto', p.nombre,
                     'titulo', d.titulo, 'tipo', d.tipo_nombre, 'es_mantenimiento', d.es_mantenimiento, 'vigente', d.vigente,
                     'mant_de', to_jsonb(coalesce(d.mant_de, '{}'::text[])),
                     'cupo_horas', case when se.mostrar_horas then d.cupo_horas end) order by p.nombre, d.titulo)
                   from crm_giwa.v_soporte_desarrollos d join crm_giwa.proyectos p on p.id = d.proyecto_id
                  where d.empresa_id = emp and d.ganado), '[]'),
    'modulos', coalesce((select jsonb_agg(distinct t.modulo) from crm_giwa.soporte_tickets t where t.empresa_id = emp and coalesce(t.modulo, '') <> ''), '[]'),
    'listas', jsonb_build_object('tipo', to_jsonb(crm_giwa.soporte_lista('Soporte_TipoCliente')), 'prioridad', to_jsonb(crm_giwa.soporte_lista('Soporte_Prioridad')),
                                 'sintoma', to_jsonb(crm_giwa.soporte_lista('Soporte_Sintoma')), 'categoria', to_jsonb(crm_giwa.soporte_lista('Soporte_Categoria')),
                                 'estado', to_jsonb(crm_giwa.soporte_lista('Soporte_Estado'))));
end $function$;

reset role;
