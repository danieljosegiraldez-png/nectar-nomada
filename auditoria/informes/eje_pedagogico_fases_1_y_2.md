# Eje pedagógico — fases 1 y 2

**Corrido el 2026-09-15** sobre `origin/main` en `b80f9d0`.
Rama `auditoria/eje-pedagogico`. Medido sobre **1.771 cadenas de interfaz** en
español y los 24 textos de estado de los motores.

---

## Primero, una corrección de algo que yo mismo dije mal

En `auditoria/INVENTARIO.md` escribí que había **«una tensión real entre dos
reglas de la casa»**: la rúbrica exige **Nivel 3** —decir qué hacer— en todo punto
que pueda alertar, y `tests/beneficio/todo-estado-tiene-texto.test.ts` prohíbe el
imperativo para proteger la autonomía del operario.

**No hay tal tensión, y se comprueba en un comando.** El guardia no prohíbe
instruir: prohíbe **decidir el destino del lote**. Su patrón literal es

```
/\b(lave|lava|lavar de inmediato|detenga|detén|pare|para el lote|suspenda)\b/i
```

Pasado contra el **ejemplo de Nivel 3 que la propia rúbrica da**:

| texto | guardia |
|---|---|
| *«Lleva 12 h sin moverse. Revisa temperatura del tanque antes de decidir: si está por debajo de 18 °C probablemente sea frío, no infección»* | **admite** |
| «PELIGRO: lave el café de inmediato» | **rechaza** ← `lave` |
| «Detenga la fermentación ahora» | **rechaza** ← `Detenga` |
| «el °Bx subió sin causa registrada — revisa el prisma» *(texto actual)* | **admite** |

La distinción es exactamente la del **antipatrón 5**: *«se explica el instrumento,
no el oficio»*. «Revisa el prisma» instruye sobre el aparato; «lave el café»
decide por quien ve el olor, el color y la espuma.

**Consecuencia práctica: P-002 no está bloqueado por nada.** Es trabajo de
redacción, no un conflicto de reglas. Dije lo contrario y estaba equivocado.

---

## Resumen

| momento | nivel exigido | nivel actual | veredicto |
|---|---|---|---|
| **Antes de medir** | 2 | **0 — no existe** | ❌ **P-001** |
| **Al registrar** | 2 | 2 | ✅ pasa |
| **Al alertar** | 3 | **2** en las que importan | ❌ **P-002** |
| **Al cerrar una etapa** | 2 | **0** | ❌ **P-003** |
| **Entre cosechas** | — | 0 (Nivel 4 inexistente) | ⚪ sin construir |

Antipatrones encontrados: **1** (alerta sin salida), **6** (vocabulario impuesto),
**8** (enseñar sólo cuando algo sale mal, parcial). **No** encontrados: 3, 7.
El **4** no se puede evaluar todavía — ver P-001.

---

## P-001 · «Antes de medir» no existe, y es el momento que la rúbrica llama el de mayor retorno

```
PANTALLA:             todas las de captura (pH, Brix, humedad, peso, flotación)
NIVEL ACTUAL:         0
NIVEL EXIGIDO:        2
MOMENTO:              antes de medir
ANTIPATRONES:         —  (la ausencia no es un antipatrón, es el hueco)
CONDICIONES DE CAMPO: no aplica — no hay contenido que evaluar
```

La rúbrica §2 lo dice con todas sus letras: *«Aquí se gana o se pierde la calidad
del dato. Toda la cadena de validación posterior no puede arreglar una muestra mal
tomada. Es el momento más desatendido en este tipo de software y el de mayor
retorno.»*

**Medido:** de 1.771 cadenas, la búsqueda de `cómo tomar|toma la muestra|
homogenei|enjuag|profundidad|sumerg|antes de medir` devuelve **10**, y las diez son
**etiquetas de campo** —«Profundidad de capa (cm)», «Profundidad del hoyo (cm)»,
«Profundidad de raíces (cm)»— de formularios de suelo. Ninguna instruye.

Y la búsqueda de `cómo pesar|tara|nivelar la báscula|agitar el agua|dejar reposar
el agua` devuelve **cero**.

**Las dos preguntas concretas del kit quedan sin contestar:**

- Fase 2 pregunta si la app enseña a tomar la muestra de licor de tanque —**punto,
  profundidad, homogeneización, enjuague del prisma**—. No enseña ninguna de las
  cuatro. Y sin eso *«las series no son comparables y ninguna validación posterior
  lo arregla»*, que es literalmente lo que el módulo de instrumentos construido
  ayer **tampoco** puede arreglar: un refractómetro verificado contra agua sigue
  dando una serie incomparable si la muestra se tomó de otro punto.
- Fase 1 pregunta si enseña a tomar la muestra de flotación y a pesar. Tampoco.

**Severidad: alta.** Es el hallazgo de mayor retorno de toda la auditoría, y el
único que no depende de ninguna decisión pendiente.

---

## P-002 · Las alertas se quedan en Nivel 2, y una es el antipatrón 1 con nombre y apellido

La rúbrica: *«Todo punto que puede emitir una alerta alcanza Nivel 3. Una alerta
sin acción es ruido que enseña a ignorar alertas.»* Revisadas **una por una**, las
24:

**Llegan a Nivel 3 — cuatro:**

| estado | texto | qué lo salva |
|---|---|---|
| `REVISION_VENCIDA` | «…Se puede seguir usando; conviene volver a contrastarlo» | dice qué hacer **y** qué pasa mientras tanto |
| `DATA_INTEGRITY_VIOLATION` | «el °Bx subió sin causa registrada — revisa el prisma» | instruye una comprobación |
| `SENSOR_FAULT` | «lectura fuera del rango medible — revisa el instrumento» | íd. |
| `SUSPECT_DILUTION` | «puede ser agua de enjuague o el electrodo fuera del líquido» | nombra las dos causas, que implican la comprobación |

**Se quedan en Nivel 2 — y son las que importan:**

| estado | texto | qué falta |
|---|---|---|
| `STAGNATION_HAZARD` | «los azúcares dejaron de bajar» | **el antipatrón 1 exacto que el kit nombra**: sin decir que se revise primero la temperatura del tanque |
| `KINETIC_PLATEAU` | «la curva lleva horas sin moverse, aunque el valor esté en rango» | íd. |
| `STALLED_ROT_HAZARD` | «el pH no baja — riesgo de pudrición» | tiene el «qué pasa si no»; **le falta el «qué hacer»** |
| `STALLED_MOLD_HAZARD` | «no baja por encima del 20 % — riesgo de moho» | íd. |
| `RATE_TOO_FAST` | «bajando muy rápido — riesgo de sellar la superficie» | íd. |
| `OVER_FERMENTED_CRITICAL` | «entrando en sobrefermentación» | es **CRITICAL** y no dice nada que hacer |
| `UNEVEN_DRYING` | «la cama seca desigual» | la acción es obvia y no está |
| `BEAN_TEMP_EXCEEDED` | «el grano va por encima de la temperatura máxima» | íd. |
| `MIXED_SAMPLE_POINTS` | «la serie mezcla puntos y no son comparables» | íd. |
| `WATCH_APPROACHING_LOW` | «acercándose al límite bajo» | íd. |

**Tres de esas diez son medias Nivel 3** —`ROT`, `MOLD`, `RATE_TOO_FAST` ya dicen
la consecuencia—, así que les falta exactamente una mitad, no las dos.

**Y no lo bloquea el guardia**, según la corrección de arriba. Lo que falta es
escribirlo.

---

## P-003 · «Al cerrar una etapa» no existe, y es lo que impide que haya Nivel 4

```
PANTALLA:             cierre de fermentación · cierre de recepción del día
NIVEL ACTUAL:         0
NIVEL EXIGIDO:        2 (mirando hacia atrás)
MOMENTO:              al cerrar
```

Búsqueda de `cómo vino|qué pasó|resumen de la|se cerró con|lectura de cierre` sobre
las 1.771: **una sola coincidencia**, y es `Apiary.colonyEndStatusLabel` —el estado
final de una colonia—, de otro módulo.

Las dos preguntas del kit quedan sin contestar: al cerrar la fermentación **el
operador no se lleva la curva ni una lectura de qué pasó**, y al cerrar la
recepción del día no se lleva una lectura de cómo vino la cosecha.

La rúbrica dice por qué importa más de lo que parece: *«Cierra el ciclo de
aprendizaje; **sin esto nunca hay Nivel 4**»* — y el Nivel 4, comparar este lote
con el 014 de febrero, es el que convierte la herramienta en experiencia
acumulada.

---

## P-004 · Antipatrón 6 · El vocabulario va del libro al campo, que es el revés

La rúbrica: *«Si en la finca se dice baba, pasilla, vinazo, chorreado, la app usa
esa palabra y enseña el término técnico al lado — nunca lo reemplaza. El glosario
va del campo al libro, no al revés.»*

**Medido, con su control:**

| | apariciones en 1.771 cadenas |
|---|---|
| término técnico — `mucílago` · `despulpado` · `pergamino` | **4** |
| término de finca — `baba` · `pasilla` · `vinazo` · `chorreado` | **0** |

El control es lo que lo convierte en hallazgo: **el concepto sí está en la app** —se
habla de mucílago y de despulpado— y la palabra de la finca **no aparece ni una
vez**. No es que el tema falte: es que se nombra sólo con el término de libro.

**Nota de dominio que refuerza el punto:** el propio `99_revision_v2_a_v3.md` §E
registra que el autor de la especificación llamó «grano desmucilaginado» a lo que
sale de la despulpadora, cuando el término correcto es **café despulpado en baba**
— y lo corrigió diciendo que *«es exactamente la confusión que ese párrafo existía
para prevenir»*. La palabra de finca era la precisa.

---

## Lo que pasa, y algunas cosas pasan bien

- **«Al registrar» llega a Nivel 2, y con algo que la rúbrica no pide.** El
  veredicto de beneficio dice qué significa *este* valor en *este* lote **y declara
  sus limitaciones** —«esto no pudo mirar: sin punto de muestreo»—. Una guía que
  dice lo que no sabe es más honesta que el Nivel 2 exigido.
- **Antipatrón 3 —muro de texto— NO está**, y es un acierto real dadas las
  condiciones de campo. Los 24 textos son de una frase; el más largo tiene **21
  palabras** — y es `REVISION_VENCIDA`, que escribí yo ayer y es el doble de largo
  que la mediana. A las cinco de la mañana con las manos mojadas eso sigue siendo
  una frase, no un muro, pero **el más largo del conjunto es el más nuevo**, que es
  la dirección en la que este antipatrón se cuela.
- **Antipatrón 7 —falsa autoridad— está activamente vigilado**, con un guardia
  escrito a propósito. Es de las pocas cosas de este eje que tienen compuerta.
- **Antipatrón 8 sólo a medias.** Sí hay textos para cuando todo va bien
  —`TARGET_REACHED`, `TERMINATION_READY`, `OPTIMAL_ACTIVE`, `DRYING_NORMAL`— así
  que el sistema no enseña **sólo** patología. Pero se quedan en Nivel 1-2
  («llegó al objetivo»), o sea que informan sin enseñar. Medio antipatrón.
- **La app funciona sin conexión.** `public/sw.js` cachea el armazón y las rutas
  del operador. La rúbrica pide que **la guía** sea contenido local: hoy no hay
  guía que cachear, así que esa condición está cumplida por vacío y volverá a
  evaluarse cuando P-001 se construya.

**Antipatrón 4 no se puede evaluar todavía.** «La guía que no se apaga» exige que
haya guía. Cero coincidencias de `primera vez|no volver a|ocultar ayuda|
principiante`, pero eso hoy sólo dice que no hay andamiaje — no que sobre.

---

## La prueba final de la rúbrica, contestada honestamente

> *«Alguien usa esta herramienta durante una cosecha completa. Al terminar, ¿sabe
> fermentar mejor que cuando empezó, o sólo tiene mejor documentada la misma
> fermentación de siempre?»*

**Hoy: sólo mejor documentada.** Y la rúbrica dice qué significa eso — *«la
herramienta funciona y el producto falló»*.

No es un juicio duro sobre lo construido: el eje funcional está sólido y el veraz
es de lo mejor que he visto en este repositorio. Es que **los tres pesan igual**, y
éste es el que no se ha empezado.

**Lo bueno es que el camino es corto y no depende de ninguna decisión pendiente.**
Los tres huecos son texto: cuatro instrucciones de toma de muestra, diez mitades de
alerta, y dos lecturas de cierre. Ninguno pide una tabla, una columna ni una
migración — y el guardia que yo creía que lo bloqueaba, no lo bloquea.
