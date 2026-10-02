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

## Lo que hay que hacer

1. Decidir con Daniel qué hace la curva con una lectura que el motor excluye: no dibujarla, dibujarla
   sin que sostenga ninguna frase, o dibujarla marcada. **No lo decide el código.**
2. Traer a `curvaDeUnLote` lo que haga falta para sostener esa decisión.
3. Un guardia que llame a la pantalla con una lectura excluida y afirme lo que se decidió. Hoy no
   existe ninguna prueba que distinga una lectura verificada de una que no lo está.
