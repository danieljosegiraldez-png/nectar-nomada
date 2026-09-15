# Fase 1 — Cosecha, selección y creación de lote

Rama `auditoria/fase-1`. Aplican las reglas de trabajo del prompt maestro.

Alcance: recolección, recepción, flotación y selección, creación del lote, y el enrutamiento de subproductos. Referencias: `docs/12_mass_balance_byproducts.md`, `docs/20_modelo_ciclo_completo.md` §1, `docs/21`, `docs/22`.

## Eje funcional

Verifica con pruebas que fallen antes de corregir:

1. Las tres ecuaciones de conservación —selección, despulpado, lavado— son independientes y cada una calcula su tolerancia sobre el insumo de su propia etapa.
2. La pulpa no puede entrar como categoría de selección de cereza. Doble conteo.
3. Un desbalance de campo se **persiste** con su discrepancia marcada; solo una violación de esquema lanza excepción.
4. `prime_ripe` no admite valor por defecto.
5. El manifiesto de enrutamiento devuelve enums, nunca prosa.
6. Las verificaciones de plausibilidad de rendimiento disparan donde deben, y **no** disparan cuando se compara la salida de despulpado contra su propio rango.
7. Al generarse pulpa se crea un `CascaraBatch` enlazado.
8. Todo peso lleva su condición de pesaje y no se comparan condiciones distintas.
9. Identidad del lote: el formato de `LOT_ID` es estable, único, y no colisiona entre fincas ni entre días.
10. La trazabilidad hacia atrás desde el lote llega hasta el lote de recolección, la parcela y el recolector — o queda claro qué eslabón falta.

## Eje veraz

- ¿Qué clase de procedencia tiene cada cifra de recepción? El peso de cereza es `MEDIDO` solo si hay báscula con verificación registrada; si alguien lo digitó de memoria es `DECLARADO`, y la diferencia debe ser visible.
- ¿Puede la altitud, la variedad o la parcela llegar a la ficha del lote sin registro que las respalde?
- ¿Hay algún punto donde un rendimiento esperado se presente como rendimiento obtenido?
- ¿El índice de pureza es navegable hasta los pesos que lo formaron?

## Eje pedagógico

Evalúa con la ficha de `docs/22` §5:

- **Antes de medir:** ¿la app enseña a tomar bien la muestra de flotación y a pesar correctamente? Aquí se decide la calidad de todo el resto de la cadena.
- **Al registrar:** cuando el operador anota un 22 % de flotadores, ¿la app le dice qué significa eso sobre la recolección en campo, o solo lo guarda?
- **Al alertar:** una alerta de alto porcentaje de defectos, ¿propone revisar la cuadrilla, el punto de maduración, el día de paso? ¿O solo informa?
- **Al cerrar:** al cerrar la recepción del día, ¿el operador se lleva una lectura de cómo vino la cosecha?
- Antipatrón 5 con particular cuidado: la selección es donde más fácil se cae en tono correctivo hacia el recolector.

## Entregables

`auditoria/informes/fase_1.md` con los hallazgos numerados `F1-001`, cada uno con eje, severidad, archivo y línea, y qué hiciste. Las pruebas que fallan y las correcciones, en commits separados según las reglas. Lo que no pudiste tocar, en `DECISIONES_PENDIENTES.md`.
