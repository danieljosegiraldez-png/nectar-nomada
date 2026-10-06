select 'CHECK nuevos (13)', count(*) from pg_constraint where contype = 'c' and conname in (
  'process_recipe_step_mucilago_en_tramos', 'process_recipe_step_horas_en_orden',
  'process_recipe_step_humedad_en_orden', 'process_recipe_step_temperatura_en_orden',
  'process_recipe_step_addition_cantidad_con_unidad', 'process_step_closing_reading_un_registro',
  'fermentation_run_paso_exige_tipo', 'drying_run_paso_exige_tipo', 'lot_process_intervention_paso_exige_tipo',
  'fermentation_intervention_paso_exige_tipo', 'lot_process_intervention_catalogo_o_tipo',
  'process_recipe_parecida_exige_motivo', 'process_recipe_solo_libre_lleva_parecido_y_motivo')
union all select 'índices únicos parciales (2)', count(*) from pg_indexes
  where indexname in ('process_target_unica_sin_paso', 'process_target_unica_por_paso') and indexdef like '% WHERE %'
union all select 'el único viejo de las metas (0)', count(*) from pg_indexes
  where indexname = 'process_target_recipe_version_id_phase_variable_moment_key'
union all select 'FK compuesta de dos columnas (1)', count(*) from pg_constraint
  where conname = 'process_target_recipe_step_id_recipe_version_id_fkey' and array_length(conkey, 1) = 2
union all select 'FK de la organización de la receta en RESTRICT (1)', count(*) from pg_constraint
  where conname = 'process_recipe_organization_id_fkey' and confdeltype = 'r'
union all select 'control: un CHECK de la Parte 1 (1)', count(*) from pg_constraint where conname = 'lot_process_cierre_sii_tipo';
