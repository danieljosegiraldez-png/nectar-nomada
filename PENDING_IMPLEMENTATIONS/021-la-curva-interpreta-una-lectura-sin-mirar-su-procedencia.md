# 021 · La curva interpreta una lectura sin mirar su procedencia

**Estado: abierto.** Encontrado el 2026-10-02 por el CLI de Codex, revisando el diff de los ejes y la
rúbrica 22 (PR de `ejes-curva`) **antes** de pedir la fusión. **No está reproducido en el navegador**:
es propagación leída en el código, con el escenario construido.

## La causa

`curvaDeUnLote` (`lib/beneficio/datosDelTablero.ts`, la consulta de mediciones) trae de cada lectura
su valor y su instante, y **no trae ni el instrumento, ni su verificación, ni la clase de
procedencia**. La curva las dibuja todas, y desde este PR **la última de ellas también sostiene una
afirmación**: el bloque que cita la matriz de pH de `docs/beneficio/10_ph_fermentation.md` §1.

O, con las palabras de Codex, que son mejores que las mías:

> Dibujar el registro y usarlo como fundamento de una interpretación requieren juicios distintos.

## La entrada concreta

Una última lectura de **pH 3,00** tomada con un instrumento cuya verificación falló. El motor de
veredictos la **excluye** —la trata como `UNCALIBRATED`— y la curva, en cambio, la pinta y le cuelga
«**Daño consumado**», citado como criterio de Néctar Nómada.

Es la misma forma que los pendientes 018 y 019: no es un cero leído como un hecho, es **una lectura
cuya procedencia nadie comprobó leída como evidencia**. Y pesa más que las dos anteriores porque la
frase que produce es categórica y va sobre el café de alguien.

## Por qué no se arregló en ese PR

Tres razones, y la tercera es la que manda:

1. Pide traer a la consulta el instrumento y su verificación, y decidir qué hace la curva con una
   lectura excluida: ¿no dibujarla, dibujarla sin interpretarla, o dibujarla marcada? Son tres
   productos distintos.
2. La segunda y la tercera opción necesitan texto nuevo en los dos idiomas, y la primera cambia lo
   que la gráfica enseña.
3. **Está fuera de §4.5 del diseño del tablero**, que es lo que ese PR ejecutaba.

## Lo que ese PR sí cerró, para que no se confunda con esto

El mismo Codex encontró que la cita se prestaba a lotes cuya receta no la respalda, y **eso sí se
arregló**: hoy el bloque sólo habla con grado `Washed`, **fermentación** abierta **y** una receta
presente. Lo que queda de aquella rama es leer los `ProcessTarget` de esa receta y comparar contra
ellos en vez de contra la plantilla — decisión de Daniel, anotada aparte — y **esto**, que es otro
eje: no qué umbral aplica, sino **si la lectura vale como prueba**.

## Lo medido, y con qué control

| qué se midió | resultado |
|---|---|
| campos que la consulta de la curva trae de cada medición | valor e instante; **ni instrumento, ni verificación, ni clase de procedencia** |
| el motor de veredictos sí los mira | excluye la lectura como `UNCALIBRATED` |
| alcanzable hoy en la base local | **no**: 0 recetas y 0 procesos abiertos, así que el bloque no sale en ningún lote |

**Y el control que falta, dicho en voz alta:** no se reprodujo con datos vivos, porque hoy no hay
ninguna receta en la base local y el bloque no llega a pintarse. Así que esto es **propagación leída**,
no un fallo observado — y hay que tratarlo como tal hasta que alguien lo vea en pantalla.

## La decisión de Daniel, 2026-10-02, y lo que se derivó midiendo

**Eligió: dibujarla marcada, y nunca interpretarla.** Se pinta con una marca propia que dice que su
instrumento no está verificado, y queda fuera de toda afirmación — no cuenta como «tu última lectura»
ni sostiene ninguna cita. Conserva el registro, que es autoritativo, y separa dibujar de interpretar.

**Y preguntó algo que obligó a medir, porque la pregunta estaba mal planteada por mí:** «aunque no
esté calibrado, la idea era que avisara pero igual registrara, ¿qué pasó?». Nada pasó. Su regla del
2026-09-14 **está implementada y se llama `REVISION_VENCIDA`**, no `UNCALIBRATED`. Son dos estados
distintos y la pregunta los mezcló:

| estado del instrumento | confianza | qué hace hoy |
|---|---|---|
| pasó el contraste, dentro de su plazo | `VALIDATED` | todo |
| pasó el contraste, **vencido** su plazo de aviso | `REVISION_VENCIDA` | alimenta curvas y puede avisar; **no confirma una `CRITICAL`** |
| **falló** el contraste | `UNCALIBRATED` | excluida del cálculo |
| nunca se contrastó | `UNCALIBRATED` | excluida del cálculo |

(`lib/equipos/verificacion.ts`, `confianzaPorVerificacion`.) Y **las cuatro se registran**: la
confianza es un campo de la lectura, no un filtro de escritura — `ph.ts:55` dice «`UNCALIBRATED` se
persiste pero no alimenta ninguna alerta». Así que «igual registra» vale siempre; lo que cambia es
qué puede sostener.

**Lo que esto derivó, y no es una preferencia:** `riesgoDeEsperar.ts` **no lleva ninguna severidad**
—0 menciones en sus 170 líneas, con el control de que el grep miró—, pero el documento normativo
clasifica así las cinco bandas que la pantalla cita:

| banda | severidad en `10_ph_fermentation.md` §1 |
|---|---|
| `[5.20, 6.50)` | **INFO** |
| `[4.50, 5.20)` | INFO antes de `ph_stall_grace_hours`; **CRITICAL (con confirmación)** después — y la pantalla la cita condicionada («si el pH se estanca…»), que es el caso CRITICAL |
| `[3.50, 3.80)` | **WARNING** |
| `[3.30, 3.50)` | **CRITICAL con confirmación** |
| `< 3.30` | **CRITICAL disparo inmediato** |

**Tres de las cinco citas son de grado CRITICAL.** Aplicando su regla del 2026-09-14 sin inventar
nada: una lectura `REVISION_VENCIDA` puede sostener la de INFO y la de WARNING, y **no** las tres
críticas. Una `UNCALIBRATED` no sostiene ninguna y se dibuja marcada.

**La única sub-decisión que queda suya:** si esa compuerta por severidad entra en el mismo cambio que
la marca de procedencia —son dos cosas que el mismo módulo necesita— o si va en una ficha aparte. El
alcance de esta ficha era la procedencia; la severidad salió al medirla.

## Lo que hay que hacer

1. Decidir con Daniel qué hace la curva con una lectura que el motor excluye: no dibujarla, dibujarla
   sin que sostenga ninguna frase, o dibujarla marcada. **No lo decide el código.**
2. Traer a `curvaDeUnLote` lo que haga falta para sostener esa decisión.
3. Un guardia que llame a la pantalla con una lectura excluida y afirme lo que se decidió. Hoy no
   existe ninguna prueba que distinga una lectura verificada de una que no lo está.
