---
description: Reinyecta el escenario de demo (bug silencioso + su reporte a logcore) sobre un onboarding recién hecho
---

# Reinyectar el escenario de demo

Esta app se usa para demostrar el ciclo completo de la plataforma: un error
llega a logcore, el clasificador lo tipifica, el debugger clona el repo, lo
arregla y abre un PR.

Para eso hacen falta dos cosas que se quitaron a propósito de `main`:

1. **Un bug** que la app calcule mal.
2. **La instrumentación** que hace que ese bug llegue a logcore.

Van separadas porque son cosas distintas: la primera no depende de nada, la
segunda depende del cliente que el onboarding acaba de generar.

## Antes de empezar

Comprueba que el onboarding ya corrió: tiene que existir un módulo cliente de
logcore en `src/` y `main.jsx` debe estar usándolo. Si no existe, **para aquí**
y corre primero la skill de onboarding de la plataforma — este comando no tiene
nada a lo que engancharse.

Mira cómo se llama de verdad la función que emite un log y qué firma tiene. No
asumas la del apéndice: el onboarding genera el cliente desde el contrato del
MCP y puede haber elegido otros nombres.

## Paso 1 — El bug

En `src/App.jsx`, invierte el predicado de `getCompletedCount`:

```js
export function getCompletedCount(todos) {
  return todos.filter((t) => !t.completed).length   // el `!` es el bug
}
```

Se eligió este bug por una razón concreta: **no lanza**. Ningún handler global
ni error boundary puede verlo. Se manifiesta solo como un número mal pintado
(`{getCompletedCount(todos)} completadas`) y como los tres tests rojos de
`src/App.test.jsx`.

No toques esos tests. Están en verde ahora mismo y tienen que ponerse rojos —
son lo que el debugger usa para reproducir el fallo y para verificar su propio
arreglo.

## Paso 2 — Hacer que se reporte

Como el bug no lanza, la única forma de que llegue a logcore es recomputar el
valor correcto y comparar. Añade un `useEffect` en el componente `App` que:

- no haga nada si la lista está vacía;
- calcule el conteo real con `todos.filter((t) => t.completed).length`;
- lo compare contra `getCompletedCount(todos)`;
- si difieren, emita **un log de severidad `ERROR`** con el cliente del
  onboarding;
- dependa de `[todos]`.

El log tiene que llevar exactamente esto:

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

## Paso 3 — No reproducir los defectos del cliente viejo

El cliente original tenía dos errores que costaron tres rondas de depuración.
Si el que generó el onboarding los tiene, **arréglalos**; no los copies del
apéndice:

- **`insert_id` de 64 caracteres.** El gateway exige `^[0-9a-f]{32}$`. El
  cliente viejo generaba 32 *bytes* (64 hex) y era un 422. Son 16 bytes, o un
  digest truncado a 32.
- **`env: 'production'`.** Los únicos valores válidos son `prod`, `staging`,
  `dev`, `test`, `local`.

Y un tercero que no es un defecto pero sí un 422: en un frontend **no mandes
`source_project`**. Vacío se rechaza; ausente se acepta.

Si el MCP expone `validate_setup`, pásale una entrada de ejemplo antes de
probar contra el gateway — comprueba justo estas reglas.

## Paso 4 — Verificar

Corre, en este orden:

```bash
pnpm install --frozen-lockfile
pnpm lint          # 0 warnings, 0 errores
pnpm build         # tiene que compilar: si falla, el import del cliente no resuelve
pnpm test          # 3 de 4 en ROJO — es el resultado esperado
```

Que `pnpm test` falle es la señal de éxito, no un problema. Los tres rojos son
los de `getCompletedCount`.

Después levanta la app, carga la lista de tareas y confirma en la pestaña de red
que sale un `POST` al gateway con `202` y `{"accepted":1,"rejected":0}`. Si
recibes un 422, lee el detalle: casi siempre es una de las tres reglas del paso
3.

## Apéndice — Cómo era antes

Referencia, no plantilla. Adáptalo a la firma real del cliente generado.

```jsx
import { log } from './logcore/client.js'

// getCompletedCount is wrong but never throws, so no global handler or error
// boundary can see it. Recomputing the count here and comparing is the only
// way this class of silent bug reaches logcore.
useEffect(() => {
  if (todos.length === 0) return
  const actual = todos.filter((t) => t.completed).length
  const reported = getCompletedCount(todos)
  if (reported !== actual) {
    log(
      'ERROR',
      `Completed count mismatch: getCompletedCount returned ${reported} but actual is ${actual}`,
      {
        labels: { handler: 'stats-validation' },
        context: { reported, actual, total: todos.length },
        fingerprint: 'todo-frontend:completed-count-mismatch',
      },
    )
  }
}, [todos])
```

El estado completo previo a la limpieza está en `2cc65a1^`:

```bash
git show 2cc65a1^:src/App.jsx
git show 2cc65a1^:src/logcore/client.js
```

Si solo quieres el bug sin la instrumentación, la rama `demo/inject-count-bug`
lo tiene aislado en un commit de una línea (`2a84cdf`), listo para
`git cherry-pick`.
