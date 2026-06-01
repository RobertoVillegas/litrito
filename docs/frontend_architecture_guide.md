# Guía de arquitectura del front-end

## 1. Objetivo

Construir un front-end con **TanStack Start** dentro de un **monorepo con Bun + Turborepo** que:

- escale bien por features,
- comparta contratos con backend,
- mantenga separación clara entre rutas, features, UI compartida y acceso a datos,
- soporte SSR, streaming, navegación tipada y search params tipados,
- y conviva naturalmente con `apps/api`, `apps/admin`, `apps/workers`, etc. dentro del mismo workspace.

---

## 2. Alcance de esta guía

Esta guía describe:

- la arquitectura del front-end,
- la estructura recomendada del monorepo,
- cómo organizar `apps/web` y `apps/admin`,
- cómo dividir rutas, features, UI compartida, data access y configuración,
- cómo compartir contratos con backend,
- y cómo mantener consistencia a largo plazo.

No entra en el detalle interno de `apps/api`, porque esa app debe tener su propia guía de arquitectura.

---

## 3. Stack asumido

- **TanStack Start** para las apps front-end
- **TanStack Router** para routing file-based y navegación tipada
- **React** como base UI
- **Bun** para workspaces y ejecución local
- **Turborepo** para orquestación de tareas en monorepo
- **Zod** y contratos compartidos para tipos de entrada/salida
- **cliente tipado hacia backend** basado en los contratos compartidos
- **TanStack Query** para cache y sincronización cliente-servidor cuando aplique

---

## 4. Principios de arquitectura

### 4.1 Feature-first

La unidad principal del front no debe ser `components/` global, sino el **feature**.

Ejemplos de features:

- auth
- billing
- chat
- files
- todos
- settings
- admin-users

Cada feature agrupa su propia:

- UI
- hooks
- schemas
- mappers
- lógica de presentación
- integración con queries o mutaciones

### 4.2 Routing-first

En TanStack Start, la carpeta `src/routes` define navegación, layouts anidados y puntos de entrada de pantalla.

Las rutas son la puerta de entrada del feature, no un detalle secundario.

### 4.3 Contratos compartidos

El front no debe inventar DTOs a mano si ya existen contratos compartidos.

Los contratos de entrada/salida deben vivir en `packages/contracts` y reutilizarse desde las apps front-end.

### 4.4 Backend como fuente de verdad

La lógica de negocio vive en backend.

El front:

- presenta datos,
- valida formularios,
- maneja navegación y UX,
- compone llamadas a backend,
- y resuelve estado de interfaz.

No debe duplicar reglas de negocio complejas.

### 4.5 Separación entre app shell y lógica de producto

Hay que separar claramente:

- shell global de la app,
- layouts,
- componentes de sistema,
- features de negocio,
- y acceso a datos.

---

## 5. Estructura general del monorepo

```text
repo/
  apps/
    web/                    # TanStack Start app principal
    admin/                  # TanStack Start app administrativa
    api/                    # backend, explicado en otra guía

  packages/
    contracts/              # contratos compartidos
    ui/                     # design system / UI compartida
    auth-client/            # wrappers de auth para front
    query/                  # query keys y helpers
    config/                 # configuración tipada compartida
    utils/                  # utilidades puras
    testing/                # utilidades de testing
    tsconfig/               # presets TS compartidos

  turbo.json
  package.json
  bun.lock
```

### Qué representa cada parte

#### `apps/web`
La app principal de usuario.

#### `apps/admin`
La app administrativa, si existe como superficie separada.

#### `apps/api`
Forma parte del monorepo, pero su estructura interna se documenta aparte.

#### `packages/contracts`
Contratos compartidos entre front y backend.

#### `packages/ui`
Componentes reutilizables y layouts compartidos.

#### `packages/auth-client`
Integración reusable del front con auth.

#### `packages/query`
Query keys, helpers y convenciones de cache.

#### `packages/config`
Variables y configuración tipadas.

---

## 6. Estructura recomendada de `apps/web`

```text
apps/web/
  src/
    routes/
    features/
    components/
    lib/
    integrations/
    styles/
    router.tsx
    entry-client.tsx
    entry-server.tsx
```

---

## 7. Responsabilidad de cada carpeta en `apps/web`

## 7.1 `src/routes/`

Contiene el árbol de rutas file-based.

Responsabilidades:

- definir segmentos de URL,
- layouts anidados,
- pantallas de entrada,
- loaders o lógica mínima de la ruta,
- composición inicial del feature.

Ejemplo:

```text
src/routes/
  __root.tsx
  index.tsx
  _public/
    login.tsx
    register.tsx
  _app/
    route.tsx
    dashboard.tsx
    todos/
      index.tsx
      $todoId.tsx
    files/
      index.tsx
      $fileId.tsx
    chat/
      index.tsx
      $chatId.tsx
  _admin/
    route.tsx
    users.tsx
```

### Regla

Las rutas deben ser delgadas. Una ruta no debe convertirse en el lugar donde vive toda la lógica del feature.

---

## 7.2 `src/features/`

Contiene la lógica del producto agrupada por dominio.

Ejemplo:

```text
src/features/
  todos/
  billing/
  chat/
  files/
  auth/
```

Cada feature puede contener:

```text
src/features/todos/
  components/
  hooks/
  lib/
  schemas/
  mappers/
  types/
```

### Responsabilidades del feature

- componentes del dominio,
- hooks de queries y mutaciones,
- lógica de formularios,
- reglas de presentación,
- adaptación de DTOs a view models,
- helpers propios del dominio.

---

## 7.3 `src/components/`

Solo para piezas globales o transversales a toda la app.

Ejemplos:

- app header
- sidebar
- theme switcher
- global loading shell
- error fallback UI

No debe llenarse con componentes específicos de negocio.

Mal ejemplo:

- `invoice-card.tsx`
- `todo-filter.tsx`

Eso debe ir en su feature.

---

## 7.4 `src/lib/`

Infraestructura del front.

Ejemplo:

```text
src/lib/
  query-client.ts
  orpc-client.ts
  auth.ts
  env.ts
  providers.tsx
```

Responsabilidades:

- crear clientes compartidos,
- inicializar providers,
- wiring técnico,
- composición base.

No debe contener lógica de negocio del producto.

---

## 7.5 `src/integrations/`

Integraciones cross-cutting del front.

Ejemplos:

- analytics
- sentry
- feature flags client-side
- performance hooks

---

## 7.6 `src/styles/`

Estilos globales, tokens, reset y temas.

---

## 8. Estructura por feature

Ejemplo recomendado:

```text
src/features/todos/
  components/
    todos-screen.tsx
    todo-list.tsx
    todo-item.tsx
    todo-form.tsx
  hooks/
    use-todos.ts
    use-create-todo.ts
  lib/
    todo-permissions.ts
    todo-search.ts
  schemas/
    todo-form.schema.ts
  mappers/
    todo-view.mapper.ts
  types/
    todo-ui.types.ts
```

---

## 9. Qué va en cada subcarpeta del feature

### `components/`
UI del feature.

### `hooks/`
Hooks del feature, normalmente para:

- queries,
- mutations,
- sincronización con search params,
- comportamiento reutilizable del dominio.

### `lib/`
Helpers específicos del feature.

### `schemas/`
Schemas de formularios, filtros o search state del feature.

### `mappers/`
Transformaciones de DTOs compartidos a modelos de UI.

### `types/`
Tipos exclusivamente de UI o view model, cuando realmente hagan falta.

---

## 10. Data access en el front

El acceso a datos debe tener una estrategia clara.

## 10.1 Camino principal

Usar cliente tipado hacia backend + cache del front.

Esto sirve para:

- queries de negocio,
- mutaciones,
- invalidaciones,
- sincronización de UI con backend.

## 10.2 Cuándo usar server routes o server functions

Úsalas solo cuando agreguen valor real al front.

Buenos casos:

- callbacks de auth,
- lectura de cookies/session en el servidor,
- redirects server-side,
- pequeños endpoints BFF específicos del front,
- composición ligera de varias llamadas backend para una vista.

No las uses para recrear el backend de negocio.

---

## 11. Recomendación de división de responsabilidades en datos

### Backend
Fuente de verdad del negocio.

### Front
- presenta,
- cachea,
- valida formularios,
- compone UX,
- sincroniza estado de interfaz.

### Contratos compartidos
Definen el lenguaje común entre front y backend.

---

## 12. Search params como estado real

Con TanStack Router conviene tratar la URL como parte del estado real de la pantalla.

Usa search params tipados para:

- filtros,
- paginación,
- sort,
- tabs,
- paneles o modos compartibles por URL.

No guardes en estado local cosas que deberían ser navegables, compartibles o restaurables por URL.

---

## 13. Layouts y shells

Organiza los layouts por áreas funcionales.

Ejemplo:

- `__root.tsx` → providers globales
- `_public/` → auth y páginas públicas
- `_app/route.tsx` → shell autenticado principal
- `_admin/route.tsx` → shell administrativo

Esto permite:

- layouts anidados limpios,
- guards por área,
- composición clara,
- navegación coherente.

---

## 14. UI compartida vs UI del feature

## 14.1 `packages/ui`

Debe contener solo piezas realmente compartidas:

```text
packages/ui/
  src/
    components/
      button.tsx
      input.tsx
      dialog.tsx
      table.tsx
    layouts/
      page-shell.tsx
      dashboard-shell.tsx
    feedback/
      empty-state.tsx
      error-state.tsx
      loading-state.tsx
```

### Regla

Si un componente depende demasiado del dominio, no pertenece a `packages/ui`.

## 14.2 UI de feature

Todo componente de negocio debe quedarse dentro del feature.

Ejemplos:

- `invoice-list.tsx`
- `chat-message-list.tsx`
- `todo-filters.tsx`
- `file-metadata-panel.tsx`

---

## 15. `packages/contracts`

Aquí viven los contratos compartidos.

Ejemplo:

```text
packages/contracts/
  src/
    auth/
    todos/
    billing/
    files/
    chat/
```

Cada dominio puede tener:

- inputs
- views
- search/filter schemas
- contratos RPC o shapes compartidos

### Regla

El front debe importar tipos/contratos públicos desde aquí, no desde el backend interno.

---

## 16. `packages/auth-client`

Responsabilidad:

- encapsular la integración del front con auth,
- exponer hooks y helpers reutilizables,
- reducir duplicación entre `web` y `admin`.

Ejemplo:

```text
packages/auth-client/
  src/
    client.ts
    hooks/
      use-session.ts
      use-auth-redirect.ts
    guards/
      require-auth.ts
```

---

## 17. `packages/query`

Responsabilidad:

- query keys,
- convenciones de invalidación,
- helpers comunes para queries/mutations,
- utilidades compartidas de cache.

Ejemplo:

```text
packages/query/
  src/
    query-client.ts
    keys/
      auth.keys.ts
      todos.keys.ts
      billing.keys.ts
      files.keys.ts
```

No debe convertirse en una carpeta donde viva toda la lógica del dominio.

---

## 18. Ejemplo completo de una pantalla

Caso: `Todos`

### Ruta

`src/routes/_app/todos/index.tsx`

```tsx
export default function TodosPage() {
  return <TodosScreen />
}
```

### Feature

`src/features/todos/components/todos-screen.tsx`

Responsabilidades:

- renderiza filtros,
- lista,
- formulario,
- estados vacíos,
- acciones principales.

### Hook de datos

`src/features/todos/hooks/use-todos.ts`

Responsabilidades:

- leer filtros/search state,
- disparar query,
- exponer loading/data/error.

### Hook de mutación

`src/features/todos/hooks/use-create-todo.ts`

Responsabilidades:

- enviar mutation,
- invalidar cache,
- manejar side effects de UI.

### Schema

`src/features/todos/schemas/todo-form.schema.ts`

Responsabilidades:

- validar formulario,
- tipar datos del form.

### Mapper

`src/features/todos/mappers/todo-view.mapper.ts`

Responsabilidades:

- convertir `TodoView` compartido en un modelo más conveniente para la UI si hace falta.

---

## 19. Convenciones de naming

## Rutas

- `index.tsx`
- `$id.tsx`
- `route.tsx`
- `__root.tsx`

## Componentes

- `todos-screen.tsx`
- `todo-list.tsx`
- `todo-item.tsx`

## Hooks

- `use-todos.ts`
- `use-create-todo.ts`

## Schemas

- `todo-form.schema.ts`
- `todo-search.schema.ts`

## Mappers

- `todo-view.mapper.ts`

## Tipos UI

- `todo-ui.types.ts`

## Query keys

- `todos.keys.ts`

Mantén nombres previsibles, explícitos y repetibles entre features.

---

## 20. Reglas de separación de responsabilidades

### Una ruta puede
- definir el segmento,
- leer search params,
- componer la pantalla,
- disparar validaciones mínimas.

### Una ruta no debe
- contener lógica compleja de negocio,
- hablar directamente con varios servicios dispersos,
- transformarse en una mini-feature.

### Un feature puede
- tener UI del dominio,
- tener hooks y mappers,
- resolver comportamiento del producto.

### Un feature no debe
- depender directamente de implementaciones internas del backend,
- duplicar reglas de negocio fuertes.

### `packages/ui` puede
- contener primitives y layouts compartidos.

### `packages/ui` no debe
- llenarse de componentes atados a un dominio concreto.

### `packages/contracts` puede
- definir el lenguaje compartido entre apps.

### `packages/contracts` no debe
- contener lógica de UI.

---

## 21. Qué poner en `apps/admin`

`apps/admin` puede seguir la misma estructura que `apps/web`:

```text
apps/admin/
  src/
    routes/
    features/
    components/
    lib/
    styles/
```

La diferencia no es estructural, sino funcional:

- más énfasis en tablas,
- workflows operativos,
- tooling interno,
- filtros complejos,
- vistas administrativas.

Puede compartir:

- `packages/ui`
- `packages/contracts`
- `packages/auth-client`
- `packages/query`

---

## 22. Qué no hacer

- No mezclar toda la lógica del producto en `src/routes`.
- No convertir `packages/ui` en un basurero de componentes semicompartidos.
- No duplicar contratos manualmente en el front.
- No reconstruir lógica de negocio fuerte en server functions del front.
- No meter componentes de dominio en carpetas globales solo “porque se usan mucho”.
- No crear una carpeta `services/` global para todo el front sin límites claros.

---

## 23. Recomendación final

La arquitectura recomendada para el front-end es:

- **TanStack Start** por app (`web`, `admin`)
- **file-based routing** en `src/routes`
- **features por dominio** en `src/features`
- **UI global mínima** en `src/components`
- **infraestructura técnica** en `src/lib`
- **contratos compartidos** en `packages/contracts`
- **UI reusable** en `packages/ui`
- **auth reusable** en `packages/auth-client`
- **query keys y helpers** en `packages/query`
- `apps/api` presente en el monorepo, pero documentado aparte

En una frase:

**TanStack Start como shell full-stack del front, rutas file-based como columna vertebral, features por dominio como unidad principal de organización, y paquetes compartidos para contratos, UI y acceso a datos dentro de un monorepo con Bun + Turborepo.**
