---
description: Reinyecta el escenario de demo (bug silencioso + su reporte a logcore) sobre un onboarding recién hecho
---

# Reinyectar el escenario de demo

Esta app se usa para demostrar el ciclo completo de la plataforma: un error
llega a logcore, el clasificador lo tipifica, el debugger clona el repo, lo
arregla y abre un PR.

**Antes de nada, mira si ya existe la rama `demo/completed-count-mismatch`.**
Contiene este escenario en un solo commit, hecho para aplicarse sobre un `main`
recién onboardeado. Si está, esto se reduce a mergear su PR y no hace falta
escribir nada:

```bash
git log --oneline main..origin/demo/completed-count-mismatch
```

El resto de este documento es para reconstruirla si se perdió.

## El contrato del emisor

El onboarding genera el cliente desde el contrato del MCP, y ese contrato fija
**el formato del cable** —qué campos van en la entrada, `insert_id` de 32 hex,
`env` dentro del enum— no cómo se llaman las funciones. Para que este escenario
siga aplicando entre onboardings, el repo fija además la firma, y
`src/logcore/client.test.js` la afirma en el bloque *el contrato del emisor*:

```js
log(severity, message, { error, context, labels, fingerprint } = {}) → entry | null
logError(error, { message, context, severity = 'ERROR' } = {}) → entry | null
```

`error` es opcional a propósito, y es justo lo que este escenario necesita: el
bug no lanza. Si tras un onboarding esos tests fallan, arregla el cliente
generado antes de seguir — no adaptes la demo a una firma nueva.

## Paso 1 — El bug

En `src/App.jsx`, invierte el predicado de `getCompletedCount`:

```js
export function getCompletedCount(todos) {
  return todos.filter((t) => !t.completed).length   // el `!` es el bug
}
```

Se eligió este bug por una razón concreta: **no lanza**. Ningún handler global
ni el error boundary puede verlo. Se manifiesta solo como un número mal pintado
(`{getCompletedCount(todos)} completadas`) y como los tres tests rojos de
`src/App.test.jsx`.

No toques esos tests. Están en verde ahora mismo y tienen que ponerse rojos —
son lo que el debugger usa para reproducir el fallo y para verificar su propio
arreglo.

## Paso 2 — Hacer que se reporte

Como el bug no lanza, la única forma de que llegue a logcore es recomputar el
valor correcto y comparar. Un `useEffect` en `App` que:

- no haga nada si la lista está vacía;
- calcule el conteo real con `todos.filter((t) => t.completed).length`;
- lo compare contra `getCompletedCount(todos)`;
- si difieren, emita un log de severidad `ERROR`;
- dependa de `[todos]`.

Con exactamente estos campos:

| campo | valor |
|---|---|
| severidad | `ERROR` |
| mensaje | `` `Completed count mismatch: getCompletedCount returned ${reported} but actual is ${actual}` `` |
| labels | `{ handler: 'stats-validation' }` |
| context | `{ reported, actual, total: todos.length }` |
| fingerprint | `todo-frontend:completed-count-mismatch` |

El `fingerprint` fijo agrupa todas las ocurrencias en un solo issue, que es lo
que se quiere para la demo. Fuera de este escenario **no lo pongas**: logcore lo
calcula solo a partir del mensaje y el stack, y uno escrito a mano sustituye un
agrupador que funciona por uno que hay que mantener a mano.

**La lista tiene que estar descompensada para que el log salga.** El predicado
invertido cuenta las pendientes, así que con tantas hechas como pendientes
—dos y dos— devuelve el mismo número que el correcto y no hay nada que
reportar. Monta la demo con un reparto desigual (tres tareas, dos hechas) o
verás la app pintando mal sin que llegue un solo error a logcore.

## Paso 3 — Verificar

```bash
pnpm install --frozen-lockfile
pnpm lint          # 0 warnings, 0 errores
pnpm build         # tiene que compilar: si falla, el import del cliente no resuelve
pnpm test          # 3 en ROJO — es el resultado esperado
```

Que `pnpm test` falle es la señal de éxito, no un problema. Los tres rojos son
los de `getCompletedCount`.

Después levanta la app, carga la lista y confirma en la pestaña de red que sale
un `POST` al gateway con `202` y `{"accepted":1,"rejected":0}`. Un 422 casi
siempre es una de estas tres: `insert_id` que no son 32 hex, `env` fuera del
enum (`prod`, no `production`), o un `source_project` presente — en un frontend
va ausente, que vacío se rechaza.
