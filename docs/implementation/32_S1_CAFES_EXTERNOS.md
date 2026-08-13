# S1 — Cafés externos: catar sin trazabilidad completa

**Esquema y capa de servicio. Sin pantallas**, siguiendo el mismo criterio de
F1 — la estructura se construye ahora, la interfaz llega cuando corresponda.

**El caso:** llega un café de un cliente o de alguien de interés. No lo
procesaste vos, y quien lo trae solo aporta nombre de finca, varietal,
proceso, y mes o año de cosecha. No hay lote de terreno, no hay cadena de
transformaciones, no hay mediciones. **Se cata igual, y ese puntaje es
válido.**

Hoy la plataforma asume que toda muestra sale de un `Lot` vía
`sample_extraction`. Este ticket rompe ese supuesto sin romper la disciplina
de procedencia.

---

## 1. Productor, procesador y marca son tres cosas distintas

El caso más frecuente en la operación real: **la Geisha de Agustín Gómez,
procesada en el beneficio de Cafelino, bajo marca Néctar Nómada.** Tres
organizaciones, un café.

Un café externo debe poder registrar por separado:

- **Finca productora** — de dónde viene el café
- **Procesador** — quién lo benefició, si es distinto (Néctar Nómada,
  Lost Origin, Cafelino)
- **Marca o comercializador** — bajo qué nombre se presenta, si aplica

Los tres pueden ser la misma organización, o tres distintas, o solo uno
conocido. Todos nulables salvo lo mínimo que identifique el café.

Esto no es solo para cafés de terceros — **es el modelo correcto para
cualquier café donde producción y procesamiento se separan**, que es buena
parte de lo que hacés.

## 2. Procedencia: declarado no es observado

Esta es la parte que no se puede aflojar.

El varietal, el proceso y la ventana de cosecha de un café externo son
**declaración de quien lo trae**, no observación tuya. Por ADR-038 eso no es
`direct_observation` ni `measured_fact` — es `manufacturer_spec` o
`interpretation`, elegido en el action layer.

Y `dataQuality` tiene que poder decir que **la cadena está incompleta**. Sin
eso, en dos años nadie distingue un puntaje de un café que trazaste completo
de uno que te contaron.

Confiabilidad típica, para calibrar expectativas: la finca suele ser
confiable, el proceso a veces lo declara quien vende, y **el varietal es lo
que más frecuentemente viene mal**.

## 3. Decisión estructural a recomendar, no asumir

Dos caminos, y hay que elegir con razones antes de implementar:

**(a) Un `Lot` mínimo** con lo que se sabe —organizaciones, varietal,
proceso, ventana de cosecha— y sin transformaciones. Ventaja: `Sample` sigue
saliendo de un `Lot` como siempre, y toda la cadena sensorial funciona sin
tocar nada. Riesgo: un `Lot` sin trazabilidad parece un `Lot` normal salvo
que la procedencia lo diga claramente.

**(b) Un `Sample` sin `Lot`**, con esos datos propios. Más simple y más
honesto sobre lo que es. Riesgo: rompe el supuesto de que toda muestra tiene
origen, y hay que revisar qué código depende de eso.

Recomendá una con razonamiento. Verificá primero cuánto código asume que
`Sample.sourceLotId` existe — eso probablemente decide la respuesta.

## 4. Ventana de cosecha, no fecha

Un café externo rara vez trae fecha exacta. Trae "cosecha 2025" o
"noviembre 2025". El modelo debe aceptar precisión variable —año solo, mes y
año, o fecha— sin obligar a inventar un día.

## 5. Clasificación y propiedad — decisión ya tomada

**El registro nace `internal`, tuyo.** Una organización cuyo café catás no
adquiere derechos sobre tu evaluación por ser dueña del café.

Compartir es **permiso explícito por caso**, vía Assignment, no herencia
automática. Si Lost Origin o una finca externa después se vuelve cliente con
cuenta, no ve retroactivamente las catas que hiciste de sus cafés salvo que
lo decidas.

Esto es consistente con el resto de la plataforma: clasificación por
registro, acceso por Assignment.

## 6. Completar después — sí, con trazabilidad de cuándo se supo

Un registro externo **se puede completar** si después conseguís más datos del
procesador o de la finca — el lote real, el proceso exacto.

Pero completar no puede parecer que se sabía desde el principio. La
procedencia y el `dataQuality` de cada campo tienen que reflejar cuándo se
supo, no solo qué se sabe. Recomendá cómo — versionado, campos con fecha de
conocimiento, o lo que el modelo ya soporte.

## 7. Fuera de alcance

- **Pantallas.** Sin UI, como F1.
- **Formulario para que terceros carguen su propia data.** Mencionado como
  posibilidad futura —un formulario que genere CSV para importar— pero no se
  construye acá. Anotalo como brecha.
- **Propiedad de datos entre organizaciones** cuando un externo se vuelve
  cliente. `29_` lo dejó anotado; se resuelve cuando se diseñe soberanía de
  datos, no acá.
- **Importador de CSV.** No existe ninguno y no se construye en este ticket.

## 8. Organización nueva a crear

**Lost Origin** — laboratorio de café de especialidad, fermentación con
levaduras y bacterias, equipo sofisticado, reconocimientos internacionales.
`organization_type: laboratory`, que ya existe en el enum.

Puede aparecer como procesador de un café tuyo, o como origen de un café que
catás — el mismo patrón que Cafelino con la Geisha de Agustín.

## 9. Verificación

1. Registrar un café externo con solo finca, varietal, proceso y año —
   confirmar que se puede catar y que llega a un puntaje.
2. Registrar uno con productor, procesador y marca distintos —el caso
   Agustín/Cafelino/Néctar Nómada— y confirmar que los tres quedan
   separados y consultables.
3. Confirmar que la procedencia refleja que varietal y proceso son
   declarados, no observados.
4. Confirmar que `dataQuality` refleja cadena incompleta.
5. Completar un registro con datos que llegan después, y confirmar que
   queda claro cuándo se supo cada cosa.
6. Confirmar que los datos reales de A7 y F1 siguen intactos.

## 10. Entregables

Migración, capa de servicio, tests, y **texto de ADR en borrador** — con la
misma marca en el encabezado que usaste en F1 para que no se vuelva un cuarto
huérfano. Registrá la decisión de §3 con su razonamiento, la de §5, y el
mecanismo elegido en §6.

Actualizá `README.md`. Confirmá el siguiente número de ADR contra el archivo
real.
