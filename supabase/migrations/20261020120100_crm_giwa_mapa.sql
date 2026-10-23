-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa.mapa_hojas · encabezado de la planilla ↔ columna de la base
-- ──────────────────────────────────────────────────────────────────────
-- Lo leen la migración (MigracionSupabase.js) y, en la fase 1, _Sheet.js.
-- Un encabezado que no está acá no se migra y sale en el reporte.
-- Las hojas de «Tablas Referencia» y las de «GIWA - CRM VF» van juntas:
-- el nombre de hoja es único entre los dos archivos.
-- ══════════════════════════════════════════════════════════════════════

delete from crm_giwa.mapa_hojas;

insert into crm_giwa.mapa_hojas (hoja, tabla, encabezado, columna, posicion)
select h.hoja, h.tabla, m.enc, m.col, m.pos
from (values
  -- ── referencias ──
  ('Usuarios','usuarios', array[
    'Usuario_ID','id', 'Usuario_Nombre','nombre', 'Usuario_Giwa','es_giwa', 'Usuario_Mail','mail',
    'Usuario_Rol','rol', 'Usuario_Factura','factura', 'Usuario_Telegram','telegram', 'Usuario_Calendario','calendario']),
  ('Tier','tier', array['Tier_ID','id', 'Tier_Multiplicador','multiplicador', 'Tier_Empresa','empresa']),
  ('Desarrollo_Dificultad','dificultad', array['Dificultad_ID','id', 'Dificultad_Multiplicador','multiplicador']),
  ('TiposDesarrollos','tipos_desarrollo', array[
    'TipoDesarrollo_ID','id', 'TipoDesarrollo_Nombre','nombre', 'TipoDesarrollo_Descripcion','descripcion']),
  ('CatalogoModulos','catalogo_modulos', array[
    'Modulo_ID','id', 'TipoDesarrollo_ID','tipo_desarrollo_id', 'Modulo_Etapa','etapa', 'Modulo_Orden','orden',
    'Modulo_Nombre','nombre', 'Modulo_Bloque_Comercial','bloque_comercial', 'Modulo_Entregable','entregable',
    'Modulo_Pregunta','pregunta', 'Modulo_Sugerido','sugerido', 'Modulo_Horas_Base','horas_base',
    'Modulo_Es_Relevamiento','es_relevamiento', 'Modulo_Es_Replicable','es_replicable',
    'Modulo_Es_Por_Instancia','es_por_instancia', 'Modulo_Padre','padre', 'Modulo_Factor','factor',
    'Modulo_Efecto','efecto', 'Modulo_Alcance','alcance']),
  ('Proyecto_Estados','proyecto_estados', array[
    'ProyectoEstado_ID','id', 'ProyectoEstado_Asignacion','asignacion', 'ProyectoEstado_Ganado','ganado',
    'ProyectoEstado_Facturable','facturable', 'ProyectoEstado_Probabilidad','probabilidad',
    'ProyectoEstado_Editable','editable', 'ProyectoEstado_Regla','regla', 'ProyectoEstado_Prioridad','prioridad',
    'ProyectoEstado_Condicion','condicion']),
  ('Desarrollo_Estados','desarrollo_estados', array[
    'DesarrolloEstado_ID','id', 'DesarrolloEstado_Ganado','ganado', 'DesarrolloEstado_Facturable','facturable',
    'DesarrolloEstado_Ejecutandose','ejecutandose', 'DesarrolloEstado_EstadoProyecto','estado_proyecto',
    'DesarrolloEstado_Detenido','detenido', 'DesarrolloEstado_Rechazar','rechazar',
    'DesarrolloEstado_Recotizar','recotizar', 'DesarrolloEstado_Renovar','renovar',
    'DesarrolloEstado_AjusteIPC','ajuste_ipc']),
  ('Estados_Reglas','estados_reglas', array['EstadoRegla_Accion','accion', 'EstadoRegla_Efecto','efecto']),
  ('Modelos_Pago','modelos_pago', array[
    'ModeloPago_ID','id', 'ModeloPago_Personalizado_Nombre','nombre', 'ModeloPago_Tipo','tipo',
    'ModeloPago_Cuotas','cuotas', 'ModeloPago_Momentos','momentos', 'ModeloPago_Personalizado','personalizado',
    'ModeloPago_Porcentajes','porcentajes']),
  ('Contrataciones','contrataciones', array[
    'Contratacion_ID','id', 'Contratacion_Categoria','categoria', 'Contratacion_Producto','producto',
    'Contratacion_Nivel','nivel', 'Contratacion_Unidad','unidad', 'Contratacion_Moneda','moneda',
    'Contratacion_CostoUSD','costo_usd', 'Contratacion_CostoARG','costo_ars']),
  ('Alternativas','alternativas', array[
    'Alternativa_ID','id', 'Contratacion_ID','contratacion_id', 'Alternativa_Producto','producto',
    'Alternativa_Categoria','categoria', 'Alternativa_Tarjeta','tarjeta', 'Alternativa_Backend','backend',
    'Alternativa_DB','db', 'Alternativa_Complejidad','complejidad', 'Alternativa_Riesgo','riesgo',
    'Alternativa_Escalado','escalado', 'Alternativa_Ideal','ideal', 'Alternativa_Recomendada','recomendada']),
  ('Impuestos','impuestos', array[
    'Impuesto_Categoria','categoria', 'Impuesto_IngresosBrutos','ingresos_brutos',
    'Impuesto_PrecioUnitarioMax','precio_unitario_max', 'Impuesto_Servicios','servicios',
    'Impuesto_AporteSIPA','aporte_sipa', 'Impuesto_AporteObraSocial','aporte_obra_social',
    'Impuesto_TotalServicios','total_servicios', 'Impuesto_MonotributoUnificado','monotributo_unificado',
    'Impuesto_SIPER','siper', 'Impuesto_Recategoriza','recategoriza']),
  ('IndicesIPC','indices_ipc', array[
    'IPC_Mes','mes', 'IPC_Valor','ipc', 'IPC_TC','tc', 'IPC_Fuente','fuente', 'IPC_Actualizado','actualizado']),
  ('CotConfig','cot_config', array[
    'CotConfig_Clave','clave', 'CotConfig_Valor','valor', 'CotConfig_Aclaracion','aclaracion', 'CotConfig_Hoja','hoja']),
  ('Comercial_Analisis','comercial_analisis', array[
    'Analisis_ID','id', 'Analisis_Ambito','ambito', 'Analisis_Nombre','nombre', 'Analisis_Umbral','umbral',
    'Analisis_Unidad','unidad', 'Analisis_Severidad','severidad', 'Analisis_Mensaje','mensaje',
    'Analisis_Activa','activa']),
  -- ── datos ──
  ('Empresas','empresas', array[
    'Empresa_ID','id', 'Empresa_Nombre','nombre', 'Empresa_Alias','alias', 'Empresa_Tier','tier_id',
    'Empresa_Logo','logo', 'Empresa_Web','web', 'Empresa_Rubro','rubro',
    'Empresa_DireccionFiscal','direccion_fiscal', 'Empresa_Localidad','localidad',
    'Empresa_Provincia','provincia', 'Empresa_Pais','pais', 'Empresa_Tipo','tipo',
    'Empresa_DriveInterno','drive_interno', 'Empresa_DriveExterno','drive_externo']),
  ('RazonesSociales','razones_sociales', array[
    'RazonSocial_ID','id', 'RazonSocial_EmpresaID','empresa_id', 'RazonSocial_Nombre','nombre',
    'RazonSocial_CUIT','cuit', 'RazonSocial_CondicionFiscal','condicion_fiscal',
    'RazonSocial_Direccion','direccion', 'RazonSocial_MailFacturacion','mail_facturacion',
    'RazonSocial_PorDefecto','por_defecto', 'RazonSocial_Nota','nota']),
  ('Contactos','contactos', array[
    'Contacto_ID','id', 'Contacto_Nombre','nombre', 'Contacto_Apellido','apellido',
    'Contacto_EmpresaID','empresa_id', 'Contacto_Email','email', 'Contacto_Telefono','telefono',
    'Contacto_Nacimiento','nacimiento', 'Contacto_AreaTrabajo','area_trabajo', 'Contacto_Puesto','puesto',
    'Contacto_FechaCreacion','creado']),
  ('Proyectos','proyectos', array[
    'Proyecto_ID','id', 'Proyecto_Empresa','empresa_id', 'Proyecto_Nombre','nombre', 'Proyecto_Tipo','tipo',
    'Proyecto_ResumenEjecutivo','resumen_ejecutivo', 'Proyecto_Sponsor','sponsor_id',
    'Proyecto_Contactos','contactos', 'Proyecto_Owner','owner', 'Proyecto_FechaPropuesta','fecha_propuesta',
    'Proyecto_Probabilidad','probabilidad', 'Proyecto_CarpetaProyecto','carpeta',
    'Proyecto_FechaPropuestaEnviada','fecha_propuesta_enviada', 'Proyecto_Estado','estado_id',
    'Proyecto_Detenido','detenido', 'Proyecto_Referencial','referencial',
    'Proyecto_FechaAprobacion','fecha_aprobacion', 'Proyecto_FechaInicio','fecha_inicio',
    'Proyecto_FechaFinalizado','fecha_finalizado', 'Proyecto_FechaCreacion','creado',
    'Proyecto_Minuta','minuta']),
  ('ProyectoDesarrollos','desarrollos', array[
    'Desarrollo_ID','id', 'Desarrollo_ProyectoID','proyecto_id', 'Desarrollo_MantDe','mant_de',
    'Desarrollo_BloqueDe','bloque_de', 'Desarrollo_Tipo','tipo_id', 'Desarrollo_Titulo','titulo',
    'Desarrollo_Descripcion','descripcion', 'Desarrollo_Dificultad','dificultad_id',
    'Desarrollo_Estado','estado_id', 'Desarrollo_Bonificado','bonificado', 'Desarrollo_Detenido','detenido',
    'Desarrollo_FechaAprobado','fecha_aprobado', 'Desarrollo_FechaInicio','fecha_inicio',
    'Desarrollo_FechaFin','fecha_fin', 'Desarrollo_DuracionHoras','duracion_horas',
    'Desarrollo_MesesContrato','meses_contrato', 'Desarrollo_Desarrollador','desarrollador',
    'Desarrollo_ModeloPago','modelo_pago_id', 'Desarrollo_QCuotas','q_cuotas', 'Desarrollo_Cuota','cuota',
    'Desarrollo_ValorCuotaActual','valor_cuota_actual', 'Desarrollo_FechaAjusteCuota','fecha_ajuste_cuota',
    'Desarrollo_IPC','ipc', 'Desarrollo_SolucionMoneda','moneda', 'Desarrollo_TotalARG','total_ars',
    'Desarrollo_TotalUSD','total_usd', 'Desarrollo_TipoCambio','tipo_cambio', 'Desarrollo_Margen','margen',
    'Desarrollo_Ajuste','ajuste', 'Desarrollo_Garantia','garantia_dias',
    'Desarrollo_MantenimientoHoras','mantenimiento_horas', 'Desarrollo_SoporteHoraARG','soporte_hora_ars',
    'Desarrollo_SoporteHoraUSD','soporte_hora_usd', 'Desarrollo_FechaCreacion','creado',
    'Desarrollo_Creador','creador', 'Desarrollo_Tier','tier_id', 'Desarrollo_ValorHora','valor_hora',
    'Desarrollo_Minuta','minuta']),
  ('ProyectoHoras','proyecto_horas', array[
    'PH_ID','id', 'PH_ProyectoID','proyecto_id', 'PH_DesarrolloID','desarrollo_id', 'PH_ModuloID','modulo_id',
    'PH_Etapa','etapa', 'PH_Modulo_Nombre','modulo_nombre', 'PH_Bloque_Comercial','bloque_comercial',
    'PH_Horas_Est','horas_est', 'PH_Moneda','moneda', 'PH_Estado','estado', 'PH_Responsable','responsable',
    'PH_Fecha_Inicio','fecha_inicio', 'PH_Fecha_Fin','fecha_fin', 'PH_Horas_Reales','horas_reales',
    'PH_Link','link', 'PH_Nota','nota']),
  ('ProyectoCostos','proyecto_costos', array[
    'PCosto_ID','id', 'PCosto_ProyectoID','proyecto_id', 'PCosto_DesarrolloID','desarrollo_id',
    'PCosto_Tipo','tipo', 'PCosto_Descripcion','descripcion', 'PCosto_Proveedor','proveedor',
    'PCosto_Recurrencia','recurrencia', 'PCosto_Externo','externo', 'PCosto_Unidad','unidad',
    'PCosto_Cantidad','cantidad', 'PCosto_USD','usd', 'PCosto_ARG','ars', 'PCosto_TotalUSD','total_usd',
    'PCosto_TotalARG','total_ars', 'PCosto_TipoCambio','tipo_cambio', 'PCosto_Creador','creador',
    'PCosto_FechaAgregado','fecha_agregado', 'PCosto_Incluido','incluido', 'Contratacion_ID','contratacion_id']),
  ('Cobros','cobros', array[
    'Cobro_ID','id', 'Cobro_ProyectoID','proyecto_id', 'Cobro_DesarrolloID','desarrollo_id',
    'Cobro_FormaPago','forma_pago', 'Cobro_CUITDestino','cuit_destino', 'Cobro_RazonSocialFC','razon_social_fc',
    'Cobro_ConceptoFC','concepto_fc', 'Cobro_CuotaNro','cuota_nro', 'Cobro_TipoComprobante','tipo_comprobante',
    'Cobro_ComprobanteNro','comprobante_nro', 'Cobro_ComprobanteFecha','comprobante_fecha',
    'Cobro_FacturaOwner','factura_owner', 'Cobro_MonedaFactura','moneda_factura', 'Cobro_MontoARS','monto_ars',
    'Cobro_TotalUSD','total_usd', 'Cobro_AjusteAcumulado','ajuste_acumulado', 'Cobro_CobradoARS','cobrado_ars',
    'Cobro_DepositoFecha','deposito_fecha', 'Cobro_TransfFecha','transf_fecha', 'Cobro_LinkFC','link_fc',
    'Cobro_Ref','ref_id', 'Cobro_FechaCreacion','creado']),
  ('GastosInternos','gastos_internos', array[
    'Gasto_ID','id', 'Gasto_Fecha','fecha', 'Gasto_Categoria','categoria', 'Gasto_Tipo','tipo', 'Gasto_Mes','mes',
    'Gasto_Descripcion','descripcion', 'Gasto_Moneda','moneda', 'Gasto_MontoARS','monto_ars',
    'Gasto_MontoUSD','monto_usd', 'Gasto_Recurrencia','recurrencia', 'Gasto_Prorratear','prorratear',
    'Gasto_Pagador','pagador', 'Gasto_Creador','creador', 'Gasto_ContratacionID','contratacion_id']),
  ('Entregables','entregables', array[
    'Entregable_ID','id', 'Entregable_ProyectoID','proyecto_id', 'Entregable_DesarrolloID','desarrollo_id',
    'Entregable_Titulo','titulo', 'Entregable_Descripcion','descripcion', 'Entregable_Tipo','tipo',
    'Entregable_Estado','estado', 'Entregable_Ambiente','ambiente', 'Entregable_Accesos','accesos',
    'Entregable_FechaCreacion','creado']),
  ('TareasDiarias','tareas', array[
    'Tarea_ID','id', 'Tarea_ProyectoID','proyecto_id', 'Tarea_DesarrolloID','desarrollo_id',
    'Tarea_Cliente','cliente', 'Tarea_Tipo','tipo', 'Tarea_Titulo','titulo', 'Tarea_Descripcion','descripcion',
    'Tarea_Responsable','responsable', 'Tarea_Prioridad','prioridad', 'Tarea_Estado','estado',
    'Tarea_Creacion','fecha_creacion', 'Tarea_Duracion','duracion', 'Tarea_Fin','fin',
    'Tarea_Vencimiento','vencimiento', 'Tarea_Frecuencia','frecuencia', 'Tarea_CanalEnvio','canal_envio',
    'Tarea_Enviada','enviada', 'Tarea_Recordatorio','recordatorio', 'Tarea_Origen','origen',
    'Tarea_Contactos','contactos', 'Tarea_Creador','creador', 'Tarea_AlertaTipo','alerta_tipo']),
  ('Comentarios','comentarios', array[
    'Comentario_ID','id', 'Comentario_TareaID','tarea_id', 'Comentario_ProyectoID','proyecto_id',
    'Comentario_ProyectoDesarrollosID','desarrollo_id', 'Comentario_Empresa','empresa_id',
    'Comentario_Contacto','contacto_id', 'Comentario_Texto','texto', 'Comentario_Fecha','fecha',
    'Comentario_Estado','estado', 'Comentario_Creador','creador']),
  ('ProyectosHistorial','proyectos_historial', array[
    'ProyectoHistorial_ProyectoID','proyecto_id', 'ProyectoHistorial_Empresa','empresa',
    'ProyectoHistorial_Caso','caso', 'ProyectoHistorial_Tipo','tipo', 'ProyectoHistorial_Tier','tier',
    'ProyectoHistorial_Resultado','resultado', 'ProyectoHistorial_VendidoARS','vendido_ars',
    'ProyectoHistorial_AbonoMes','abono_mes', 'ProyectoHistorial_CatalogoARS','catalogo_ars',
    'ProyectoHistorial_BrechaPct','brecha_pct', 'ProyectoHistorial_Nota','nota'])
) as h(hoja, tabla, pares)
cross join lateral (
  select h.pares[i] as enc, h.pares[i+1] as col, (i + 1) / 2 as pos   -- posición = orden en la hoja
  from generate_series(1, array_length(h.pares,1), 2) as i
) m;

-- Control: toda columna mapeada existe de verdad en la tabla
do $$
declare malas text;
begin
  select string_agg(m.tabla || '.' || m.columna, ', ') into malas
  from crm_giwa.mapa_hojas m
  left join information_schema.columns c
    on c.table_schema = 'crm_giwa' and c.table_name = m.tabla and c.column_name = m.columna
  where c.column_name is null;
  if malas is not null then raise exception 'mapa_hojas apunta a columnas que no existen: %', malas; end if;
end $$;
