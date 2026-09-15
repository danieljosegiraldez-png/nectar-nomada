# Decisiones pendientes de la auditoría

Lo que un hallazgo necesita y el kit prohíbe tocar sin aprobación de Daniel.
**Un hallazgo que aparece aquí no está corregido**, y aparece aquí precisamente
para que no se corrija por inercia.

---

## D-F2-01 · Qué forma tiene `MIXED` — viene de F2-001

**Qué falta decidir.** Un lote fusionado a partir de padres con orígenes distintos
no puede seguir diciendo que viene de uno de ellos. El criterio 7 pide que *«todo
atributo no idéntico entre padres se vuelva `MIXED` con su composición»*, y este
repositorio no tiene esa noción. Hay tres formas y cuestan distinto:

| forma | qué permite | qué cuesta |
|---|---|---|
| **columna anulable** (`locationId` a `null` + una marca) | decir «mezclado» y no mentir | lo más barato; **pierde la composición** — no contesta «¿qué proporción vino de dónde?» |
| **tabla de composición** (`LotOriginComposition`: lote, origen, proporción) | contesta la proporción, que es lo que una ficha honesta necesita | una tabla y su migración; es lo que el propio esquema ya anticipa en `schema.prisma:3244` para cultivares, sin construir |
| **valor de catálogo** `MIXED` en cada eje | uniforme con el resto del vocabulario | un valor de catálogo no lleva proporciones; acaba necesitando la tabla igual |

**Recomendación, y es de las que dejan de ser gratis pronto:** la tabla de
composición, porque el esquema ya la tiene prevista para cultivar y construir dos
mecanismos distintos —uno para cultivar, otro para origen— es la divergencia que
`README.md` avisa. Hoy ninguno de los dos existe, así que plegarlos cuesta cero.

**Lo que NO depende de esta decisión y se puede corregir ya:** el `orderBy`
ausente y la ausencia de guardia entre sitios distintos. Que el origen lo elija el
orden de recorrido de un índice no necesita aprobación de nadie.

---

## D-F2-02 · Qué cuenta como «transición destructiva» — viene del criterio 17

**Qué falta decidir.** El criterio pide que ninguna transición destructiva ocurra
sin confirmación humana, y antes de medirlo hay que saber cuáles son. Candidatas
que este repositorio ya tiene: `disposal`, `sale`, `loss`, cerrar un proceso,
sacar un lote de secado antes de su objetivo, y dividir un lote al 100 %.

**No se propone una lista**: quién decide qué es irreversible en un beneficio es
el dueño, y una lista inventada convertiría el criterio en una comprobación que
se cumple sola.

---

## D-F2-03 · Si un lote dividido al 100 % se cierra o sólo se avisa — viene de F2-003

**Qué falta decidir.** El criterio 4 dice «queda cerrado» y pide que el sistema lo
impida de verdad. Pero la decisión §7.1 de Daniel sobre instrumentos fue
justamente la contraria —**degradar, nunca bloquear**, porque bloquear se esquiva
en el patio y el sistema acaba sabiendo menos— y conviene preguntarle si esa misma
regla aplica aquí o si ésta es la excepción.

Son dos mundos distintos: una lectura tomada con un instrumento vencido sigue
siendo un hecho ocurrido; una lectura contra un lote que ya no está en ningún
tanque es, casi seguro, una equivocación de a qué lote se apuntó. **La segunda
parece caso de bloquear.** Pero es su criterio, no el mío.

---

## D-F1-01 · ¿Son la misma selección, o dos etapas distintas? — viene de F1-001

**El repositorio** tiene una: `accepted + rejected + declared loss = input`,
construida, en uso, once filas reales.

**La especificación** (`docs/beneficio/12` §A) tiene otra:
`total_cherry = prime_ripe + semi_ripe + underripe + overripe`, una descomposición
**por madurez** que alimenta el índice de pureza y el manifiesto de enrutamiento —
y que **no se guarda en ninguna parte**.

Comparten el nombre y no son lo mismo. Y esto **no lo resuelvo yo**: el prompt
maestro dice que ante una contradicción entre un documento y el código hay que
parar y preguntar, no elegir la lectura más cómoda de implementar.

**Las dos lecturas posibles, y cuestan distinto:**

| lectura | qué implica |
|---|---|
| **son dos etapas distintas** — una en el patio al recibir la cereza, otra al separar lotes | hacen falta cuatro masas nuevas donde hoy no hay ninguna, y el motor `validarSeleccion` empieza a poder correr |
| **son la misma vista de dos maneras** | la especificación se ajusta al modelo del repositorio, y el índice de pureza se redefine sobre accepted/rejected |

**No recomiendo ninguna.** Cuál de las dos es depende de cómo se trabaja en tu
beneficio, que es justo lo que un documento no puede decirme.

---

## D-F1-02 · Dónde vive la cáscara — viene de F1-002

`CascaraBatch` **no existe** como tabla (control positivo: `BiocharBatch` sí). El
motor devuelve `cascaraBatchPropuesto` —propuesto y no creado, para respetar la
§32— pero **una propuesta que nadie puede aceptar no es media función: es
ninguna**.

Hacen falta dos cosas y las dos son decisión de modelo: la tabla, y el sitio donde
alguien acepta la propuesta. `docs/beneficio/12` trata la cáscara como **producto
con valor**, así que dejarla fuera de la trazabilidad tiene coste real.

---

## D-F1-03 · Si un peso debe decir con qué báscula se pesó — viene de F1-003

Hoy `HarvestEvent`, `ReceivingEvent` y `QuantityEvent` llevan `provenanceClass`
obligatorio y sin defecto, así que **medido** y **declarado** ya se distinguen. Lo
que falta es atar un peso a **qué báscula**.

**Es aditivo y del patrón ya construido:** una columna anulable `instrumentId` en
`quantity_event`, junto a lo que hay, sin relleno retroactivo — exactamente como
las cuatro FK de equipo del 2026-09-14.

**Y hoy es una asimetría nueva:** desde esa fecha `Measurement` sí puede decir con
qué instrumento se midió y si estaba verificado. Un peso, no. Como tú decidiste
que la verificación es por contraste contra patrón, una báscula se verifica con
pesa patrón igual que un refractómetro con agua — la maquinaria ya está.

---

## D-V-01 · El `orderBy` que falta se puede arreglar sin ti, y conviene decirlo

**No es una decisión: es la nota de que V-001 tiene dos mitades y sólo una espera.**

`recordTransformation` elige el origen del lote fusionado con `inputLots[0]`, y ese
`findMany` **no lleva `orderBy`**. Eso hace el defecto **no determinista**: la misma
fusión puede resolverse distinto en dos lecturas.

**Arreglarlo no necesita tu aprobación** —no toca modelo de datos, ni umbrales, ni
nada de la lista reservada— y convierte «aleatorio» en «el primero que el operario
escribió», que sigue estando mal pero al menos es explicable y reproducible.

**Lo que sí te espera es la otra mitad**, `D-F2-01`: qué forma tiene `MIXED`. Sin
eso, un lote fusionado seguirá siendo indistinguible de uno de origen único en las
doce superficies de salida — incluida la altitud que la pantalla imprime, y el huso
horario con el que formatea todas sus fechas.

---

## D-P-01 · Qué se enseña «antes de medir», y eso no lo saca de un documento

**Viene de P-001, el hallazgo de mayor retorno de la auditoría.**

La rúbrica pide que la app enseñe a tomar bien la muestra. Para el licor de tanque
son cuatro cosas concretas —**punto, profundidad, homogeneización, enjuague del
prisma**— y para la recepción, cómo se toma la muestra de flotación y cómo se pesa.

**Y esto no es texto que yo pueda redactar.** Es cómo se hace en **tu** beneficio:
a qué profundidad metes el vaso en el Tanque I, si homogeneizas antes o después,
con qué enjuagas el prisma, cuántas cerezas van al flotado y en cuánta agua.
Escribirlo por mí sería inventar un procedimiento — y encima el antipatrón 5 dice
que *«el productor es el experto en su finca; la app trae un instrumento, no
autoridad»*.

**Lo que sí puedo hacer sin ti:** el sitio donde ese texto vive —un campo de guía
por variable, local y sin red, que aparece antes del formulario— y las **diez
mitades de alerta** de P-002, que sí son inferibles del propio dominio y no
inventan procedimiento.

**Lo que necesito de ti son cuatro frases**, no un documento. Una por
procedimiento, dichas como las dices en el patio.

