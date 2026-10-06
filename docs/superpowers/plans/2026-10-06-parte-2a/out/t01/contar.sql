select 'process_recipe_step', count(*) from traceability.process_recipe_step
union all select 'process_recipe_step_addition', count(*) from traceability.process_recipe_step_addition
union all select 'process_recipe_step_end', count(*) from traceability.process_recipe_step_end
union all select 'process_recipe_step_requirement', count(*) from traceability.process_recipe_step_requirement
union all select 'process_step_closing_reading', count(*) from traceability.process_step_closing_reading
union all select 'process_target', count(*) from traceability.process_target
union all select 'process_recipe', count(*) from traceability.process_recipe
union all select 'process_recipe_version', count(*) from traceability.process_recipe_version
union all select 'lot_process', count(*) from traceability.lot_process
union all select 'lot_process_intervention', count(*) from traceability.lot_process_intervention
union all select 'fermentation_run', count(*) from traceability.fermentation_run
union all select 'fermentation_intervention', count(*) from traceability.fermentation_intervention
union all select 'drying_run', count(*) from traceability.drying_run
union all select 'measurement', count(*) from traceability.measurement
union all select 'lot', count(*) from traceability.lot
union all select 'variable_catalog', count(*) from research.variable_catalog
union all select 'variable_catalog_value', count(*) from research.variable_catalog_value
union all select 'organization', count(*) from core.organization;
