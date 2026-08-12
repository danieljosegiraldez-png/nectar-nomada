# A0 — dimensionar tres opciones de offline antes de comprometerse

**Análisis y dimensionamiento únicamente.** Sin código, sin esquema, sin
migraciones. Producir una comparación y una recomendación, luego detenerse.

No iniciar A0–A8 ni T14.

---

## 1. Por qué este pase existe

El pase de alcance de apiario concluyó correctamente que offline no es
honestamente diferible para apiario, y lo convirtió en el ticket A0 — la capa
PWA completa de `OFFLINE_FIELD_CAPABILITY.md`: service worker, cola de
borradores en IndexedDB, sincronización, y resolución de conflictos versionada.

Ese razonamiento sobre la *necesidad* es sólido y no está en discusión. Doce
colmenas seguidas sin señal es el caso real, y transcribir de memoria esa noche
degrada un `direct_observation` a una recolección diferida — exactamente el
modo de falla que ADR-044 existe para evitar.

**Lo que no se evaluó es si A0 es la única forma de resolverlo.** El reporte
reconoció honestamente que A0 es la mayor incógnita del conjunto, sin
precedente alguno en el repositorio, probablemente más grande que A5 — y aun
así es la única opción dimensionada. Comprometerse con la solución más cara sin
haber comparado alternativas es la decisión que este pase debe evitar.

Contexto que importa: `OFFLINE_FIELD_CAPABILITY.md` especifica la solución
completa porque fue escrito como arquitectura general para toda la plataforma —
Partner Workspace, mapa, estudios de campo, múltiples operadores. Kenneth,
solo, en un sitio, durante una temporada, puede no necesitar toda esa
arquitectura.

## 2. Las tres opciones a dimensionar

Dimensionar cada una con el mismo rigor. No favorecer ninguna de antemano.

### Opción A — A0 completo, como está especificado

La capa PWA completa de `OFFLINE_FIELD_CAPABILITY.md` §1–6.

Reportar: tamaño real relativo a los tickets ya construidos, qué partes no
tienen precedente en el repositorio, y — con honestidad — cuánto de ese tamaño
es incertidumbre genuina versus trabajo conocido.

### Opción B — borrador local mínimo

IndexedDB para las capturas del día, con un control explícito de sincronizar.
Sin service worker, sin caché de la aplicación, sin resolución automática de
conflictos.

La razón por la que esto puede bastar: **Kenneth es el único operador en su
sitio.** `OFFLINE_FIELD_CAPABILITY.md` §4 resuelve el caso de dos personas
etiquetando el mismo árbol estando ambas offline. Ese caso no ocurre en Cerro
Azul esta temporada — un solo operador, sus propias colmenas. La resolución de
conflictos versionada es la parte más compleja de la Opción A y puede ser
precisamente la que no se necesita.

Evaluar y responder directamente:

- ¿Funciona sin service worker? Es decir, ¿basta con que la página ya esté
  abierta cuando se pierde la señal, o el operador realmente necesita poder
  *cargar* la aplicación sin conexión?
- ¿Qué pasa si el navegador se cierra, el teléfono se reinicia, o la pestaña se
  descarta por memoria a mitad de sesión? Esta es la pregunta que decide si la
  Opción B es real o frágil.
- ¿Qué se rompe cuando llegue un segundo operador — Chayanne, Mickelle, o
  cualquiera en v1.1? ¿Es una extensión aditiva hacia la Opción A, o trabajo
  desechable?
- ¿Cuánto de la Opción A se aprovecha después, si esto se construye ahora?

### Opción C — papel, con procedencia honesta

No construir nada. Kenneth anota en papel y transcribe esa noche.

Esto no es "no hacer nada" — el modelo ya puede decir la verdad al respecto, y
esa capacidad es real: `provenanceClass` y `dataQuality` per ADR-038 pueden
registrar honestamente que fue una recolección diferida y no una observación
directa, en vez de fingir que la inspección se capturó en la colmena.

Evaluar:

- ¿Qué valores exactos de `provenanceClass` y `dataQuality` corresponden, y
  existen ya en el vocabulario o haría falta agregar alguno?
- ¿Qué se pierde realmente? Ser específico: hora exacta de la inspección,
  fotos tomadas en el momento, detalle que se olvida entre la colmena y la
  casa.
- ¿Cuánta fricción agrega para Kenneth, y hace más probable que simplemente no
  registre?

## 3. Lo que la comparación debe entregar

Una tabla comparando las tres en: tamaño de construcción, incertidumbre
(distinta de tamaño), qué resuelve, qué no resuelve, qué se pierde, y qué
trabajo queda aprovechable si después se necesita la Opción A.

Luego una **recomendación con razonamiento**, no una lista de opciones
equilibradas. Si la Opción A resulta genuinamente necesaria, decirlo — el punto
de este pase no es recortar alcance, es no comprometerse con lo más caro sin
haber mirado.

Un criterio explícito para decidir: **¿qué opción hace más probable que la
temporada de diciembre a abril quede registrada?** Una capa PWA a medio
terminar en diciembre es peor que papel bien registrado. Un borrador local
frágil que pierde datos al reiniciar el teléfono es peor que ambos.

## 4. Consecuencias sobre el desglose A0–A8

Para la opción recomendada, reportar qué cambia:

- ¿Sigue existiendo A0 como ticket, y con qué tamaño?
- ¿A5 sigue dependiendo de él, o puede empezar antes?
- ¿Cambia la definición de terminado de A8 — el reporte pedía que la prueba
  E2E incluyera al menos una inspección registrada por la ruta offline?
- ¿Cambia la secuencia frente a T14, único ticket de café pendiente?

## 5. Una pregunta separada, del mismo reporte

El desglose señala que A4 es de esfuerzo casi nulo y recomienda plegarlo en la
definición de terminado de A3 en vez de seguirlo como ticket propio. Confirmar
o rechazar eso explícitamente en este pase — es una decisión pequeña que
conviene cerrar antes de empezar a construir, no a mitad de camino.

## 6. Entregables

La comparación de §3, la recomendación con razonamiento, las consecuencias de
§4, y la respuesta a §5 — escritas a
`docs/implementation/25_OFFLINE_OPTIONS_ANALYSIS.md`, no entregadas solo como
respuesta en chat.

Reportar y detenerse. No iniciar construcción.
