# P5 — Cliente Android: lo que hay que decidir y tener antes de escribir una línea

Fase 5 de `docs/architecture/COFFEE_FIELD_OS_AUDIT.md` §26 y §17.

**Contexto obligatorio:** el audit §17 (arquitectura móvil offline), §19
(autenticación offline), §34 (hardware de gama baja) y §58 Decisión A —
*nativo en vez de extender la PWA*, resuelta por el dueño el 2026-08-27—, más
ADR-107 y ADR-108, cuyo razonamiento se aplica aquí con más fuerza que en
ninguna fase anterior.

---

## 0. Lo medido, y por qué este ticket empieza por lo que NO se puede construir

Medido el 2026-09-05, no estimado:

| | |
|---|---|
| React Native / Expo en el repositorio | **nada** |
| Android Studio, SDK de Android, `adb` | **no instalados en esta máquina** |
| Disco libre | **6,2 GB** — Android Studio con un emulador son ~15 |
| Teléfono Android físico conocido | **ninguno** |
| `core.device` en producción | **0** |
| `traceability.field_session` en producción | **0** |
| `traceability.field_event` en producción | **0** |
| Cuentas con contraseña | **1** (la de Daniel) |

Las tres primeras filas son de máquina y se resuelven instalando cosas. Las
tres últimas son las que deciden si merece la pena hacerlo ahora, y son de
Daniel.

**La Fase 4 dejó el carril de sincronización completo y nadie lo ha usado.**
Push por lotes, pull por cursor, cola de medios, instantánea de autorización y
purga de borradores: construido, desplegado, probado de punta a punta en un
navegador, y con **cero jornadas registradas**. Construir encima de eso un
cliente nativo —conversión a workspaces, Expo, espejo SQLite, cámara, GPS,
validación en hardware real— es la forma de ADR-107 a la máxima escala posible.

**Esto no dice que la Fase 5 esté mal.** La Decisión A ya se tomó y sigue en
pie: la PWA no sirve para días sin señal en una finca. Dice que el orden
importa, y que hay una cosa que cuesta una tarde y contesta más que un mes de
código: **que alguien recorra una jornada real en la PWA**. De ahí salen las
respuestas a casi todo lo que este ticket tiene que suponer.

---

## 1. El prerrequisito que no es de esta fase: §2, el carril de tokens

`ADR-108` aplazó el carril de tokens de `46_P4` §2 «hasta que exista un cliente
nativo que lo llame». **Ese día es éste**, y la razón es dura: un cliente nativo
**no puede** autenticarse con la cookie de sesión que usa la PWA.

Así que §2 **se construye primero y pertenece al ticket 46, no a éste**: login
inicial contra un endpoint de token, alta de `Device` con refresh token ligado
al aparato, access tokens cortos, y revocación que invalida el refresh al
instante y hace rechazar sus mutaciones en cola.

Sin eso, ninguna línea de Android puede hablar con el servidor. Con eso, todo
lo demás de la Fase 5 es cliente.

---

## 2. Lo que el audit ya decidió, y no se vuelve a discutir

- **React Native, Android primero.** No Flutter —no comparte TypeScript con el
  paquete de dominio, que es el argumento entero de reutilización— y no un
  envoltorio Capacitor sobre la PWA, que hereda el comportamiento de memoria del
  WebView justo en el hardware de gama baja al que esto apunta.
- **Workspaces cuando la app empiece de verdad, no antes.** `apps/web`,
  `apps/mobile`, `packages/domain`, `packages/api-contract`. El audit lo dice
  con estas palabras: *un monorepo prematuro es churn.*
- **SQLite como almacén operativo, no como caché**: es autoritativo para lo
  creado localmente hasta que sincroniza. Un espejo del subconjunto operativo,
  **no de las 122 tablas**.
- **Descarga selectiva por asignación**, que es exactamente lo que el pull de
  §5 ya hace.
- **Presupuesto de gama baja:** bundle < ~30 MB, arranque en frío < ~3 s, SQLite
  < ~500 MB con los medios como archivos y no como blobs, sin sondeo en segundo
  plano.

---

## 3. Decisiones que este ticket NO puede tomar

**Son de Daniel, y las tres primeras bloquean trabajo real:**

1. **¿Hay un teléfono Android?** El audit exige validación en hardware real de
   gama baja. Sin aparato no hay forma de comprobar el presupuesto de arranque,
   memoria ni batería — y esas son las cifras que deciden si el diseño sirve.
2. **¿Se instala Android Studio en esta máquina?** Son ~15 GB y hoy hay 6,2
   libres. Hay una salida: **Expo Go sobre un teléfono físico** no necesita ni
   Studio ni emulador, y basta para todo salvo generar un APK firmado. Si la
   respuesta es «no se instala», el camino es Expo Go y el APK se construye en
   la nube (EAS Build), que es cuenta y gasto suyos.
3. **¿Quién lleva el aparato?** ADR-109 fijó que los aparatos son personales.
   Un aparato sin operador asignado no tiene a quién atribuir el trabajo, y hoy
   **13 de 14 personas no tienen ni contraseña** (P-C, abierta desde hace
   semanas). Un cliente nativo para gente que no puede entrar no sirve.
4. **¿Antes o después de la cosecha de febrero?** La cosecha es la única ventana
   del año donde el trabajo de campo ocurre a diario. Llegar con la app a medias
   es peor que llegar sin ella: la PWA ya funciona.

---

## 4. La primera rebanada, cuando se desbloquee

**Una pantalla: abrir jornada, anotar una observación, sincronizar.** Nada más.

Sin cámara, sin QR, sin notificaciones, sin espejo SQLite completo — sólo la
tabla de borradores y el push de §4, que ya existe y está probado. Es el
equivalente nativo de lo que la PWA hace hoy, y sirve para medir en hardware
real las tres cifras que deciden el resto: arranque en frío, memoria y tamaño
del bundle.

**Criterio de aceptación, de flujo y no de test**, con el precedente de ADR-095
y del §11 de `46_P4`: un operador con el teléfono en modo avión anota una
observación en un cafetal, vuelve a cobertura, y el evento aparece en la base —
y repetir la sincronización no crea una segunda fila. Exactamente el criterio
que la PWA ya cumple, ahora sobre el aparato que va a llevar encima.

---

## Fuera de alcance

- Todo lo de §7 de la Fase 4 que sigue pendiente: subida reanudable multipart.
- Reportes (Fase 6) y geoespacial (Fase 7).
- iOS. El audit dice Android primero y no dice cuándo el segundo.
