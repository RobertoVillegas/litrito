# Hono Architecture Guide

## Purpose

This guide explains how to implement the proposed backend architecture in a consistent way across a Hono-based monorepo. It is intentionally practical. The goal is not only to describe the architecture, but to make it easy for a team to build modules, review pull requests, and keep boundaries from decaying over time.

The architecture assumes:

- Hono as the HTTP/runtime shell
- feature-based hexagonal modules
- explicit composition instead of framework DI
- Zod for schemas
- oRPC for typed contracts where useful
- Postgres as the main durable database
- Redis and BullMQ for async jobs and workflows
- Better Auth for auth/session flows
- OpenTelemetry for observability

---

## 1. Mental model

Think about the backend in layers and execution surfaces.

### Layers inside a feature

Every feature follows the same shape:

```text
features/<feature>/
  domain/
  application/
  transport/
  infrastructure/
  <feature>.module.ts
```

The layers mean:

- **domain**: business truth
- **application**: use cases and orchestration
- **transport**: HTTP/RPC entrypoints
- **infrastructure**: concrete adapters
- **module file**: feature wiring/composition

### Execution surfaces across the platform

The system is split into several deployable surfaces because not all workloads should run in the same process:

- `apps/api`: transactional business API
- `apps/ai-gateway`: chat/streaming/tool surface
- `apps/workers`: queue processors and durable workflows
- `apps/ingest`: parsing/chunking/embedding pipelines
- `apps/web`, `apps/admin`: frontend apps

The biggest mistake to avoid is putting all of this into one giant Hono server.

---

## 2. Repo structure

A practical monorepo structure:

```text
repo/
  apps/
    api/
      src/
        main.ts
        app/
          build-app.ts
          build-deps.ts
          register-modules.ts
        shared/
          http/
          kernel/
          infra/
        features/
          auth/
          users/
          billing/
          todos/
          notifications/
          files/
          imports/
          exports/
          bulk-operations/
          audit/
          health/
    ai-gateway/
      src/
        main.ts
        app/
        shared/
        features/
          chat/
          assistants/
          retrieval/
          agent-tasks/
    workers/
      src/
        main.ts
        workers/
    ingest/
      src/
        main.ts
        pipelines/
    web/
    admin/

  packages/
    contracts/
    auth/
    database/
    queueing/
    files/
    retrieval/
    ai-core/
    observability/
    config/
    testing/
    tooling/
```

### Rule of thumb

- If it is a **deployable runtime**, it belongs in `apps/`
- If it is a **reusable library or platform capability**, it belongs in `packages/`
- If it is a **business capability**, it belongs in `features/` inside the relevant app

---

## 3. What belongs in `packages`, `shared`, and `features`

This distinction is crucial.

## `features/*`

Use for business capabilities:

- users
- billing
- todos
- notifications
- files metadata/access
- exports/imports

A feature owns domain, use cases, routes, and adapters specific to that business area.

## `shared/*`

Use for app-local cross-cutting technical concerns:

- common middleware
- app-local kernel abstractions
- app-specific infra setup
- request context helpers

This is not for business logic.

## `packages/*`

Use for cross-app reusable libraries:

- contracts
- database helpers and schema
- queueing infrastructure
- auth setup
- observability
- file parsing/generation primitives
- retrieval/vector logic
- AI orchestration primitives
- testing helpers
- generators/tooling

### Red flags

Move something **out of a feature** only if:

- it is used by multiple apps
- it is stable enough to become a platform contract
- it is not secretly business-specific

Move something **out of shared** if it starts containing business rules.

---

## 4. Hono’s role in the architecture

Hono is the transport/runtime shell.

Use Hono for:

- creating the app
- registering middleware
- grouping routes
- parsing request data
- storing request-scoped context
- streaming responses
- sending HTTP responses

Do not use Hono as:

- your domain model
- your DI strategy
- your transaction boundary manager
- your service locator
- the place where core business logic lives

The architecture should still make sense if you replaced Hono with another HTTP adapter.

---

## 5. App composition

Each app has two main builders.

## `build-deps.ts`

Creates long-lived shared dependencies.

Example responsibilities:

- database client
- Redis client
- logger
- telemetry setup
- storage client
- auth helpers
- job bus
- event bus
- clock/id generator

Example:

```ts
export type AppDeps = {
  db: DbClient
  redis: RedisClient
  logger: Logger
  telemetry: Telemetry
  auth: AuthServices
  storage: FileStorage
  jobBus: JobBus
  eventBus: EventBus
  idGen: () => string
  clock: { now(): Date }
}

export function buildDeps(): AppDeps {
  const db = createDbClient()
  const redis = createRedisClient()
  const logger = createLogger()

  return {
    db,
    redis,
    logger,
    telemetry: createTelemetry(),
    auth: createAuthServices(db),
    storage: createStorage(),
    jobBus: createJobBus(redis),
    eventBus: createEventBus(),
    idGen: createIdGenerator(),
    clock: { now: () => new Date() },
  }
}
```

## `build-app.ts`

Creates the Hono app and mounts middleware and features.

```ts
export function buildApp(deps: AppDeps) {
  const app = new Hono()

  app.use('*', requestIdMiddleware())
  app.use('*', otelMiddleware(deps.telemetry))
  app.use('*', loggingMiddleware(deps.logger))
  app.use('*', errorHandler())

  const authModule = createAuthModule(deps)
  const todosModule = createTodosModule(deps)
  const billingModule = createBillingModule(deps)

  app.route('/auth', authModule.routes)
  app.route('/todos', todosModule.routes)
  app.route('/billing', billingModule.routes)

  return app
}
```

## `register-modules.ts`

Optional. Useful if you want module registration in one place rather than directly in `build-app.ts`.

---

## 6. Building a feature module

Every feature gets a composition file:

- `users.module.ts`
- `billing.module.ts`
- `todos.module.ts`

This is the Hono/explicit-composition replacement for Nest’s `@Module()`.

Example:

```ts
// features/todos/todos.module.ts
export function createTodosModule(deps: AppDeps) {
  const todoRepository = new DrizzleTodoRepository(deps.db)
  const todoAuthorizationService = new TodoAuthorizationService()

  const routes = createTodosRoutes({
    todoRepository,
    todoAuthorizationService,
    auth: deps.auth,
    idGen: deps.idGen,
    logger: deps.logger,
  })

  return {
    routes,
  }
}
```

### Module factory rules

A module factory should:

- instantiate feature adapters
- wire shared deps into feature-local deps
- create route groups / RPC routers
- expose only the entrypoints needed by the app

A module factory should not:

- do real business work
- execute queries
- become a service locator
- hide huge unrelated dependency bundles

---

## 7. Feature folder structure in detail

A robust feature structure:

```text
features/todos/
  domain/
    entities/
      todo.entity.ts
    value-objects/
    errors/
      todo.errors.ts
    events/
      todo-completed.event.ts
    services/
      todo-policy.service.ts

  application/
    commands/
      create-todo.command.ts
      complete-todo.command.ts
    queries/
      list-todos.query.ts
      get-todo.query.ts
    ports/
      todo-repository.port.ts
      job-bus.port.ts
    services/
      todo-authorization.service.ts
    mappers/
      todo-view.mapper.ts
    sagas/
      todo-reminder.saga.ts
    errors/
      todo.application-errors.ts

  transport/
    http/
      routes/
        todos.routes.ts
        todos-admin.routes.ts
      middleware/
        require-auth.ts
        require-todo-owner.ts
      schemas/
        create-todo.http.schema.ts
        update-todo.http.schema.ts
    rpc/
      todos.router.ts

  infrastructure/
    repositories/
      drizzle-todo.repository.ts
    providers/
    queues/
      bullmq-todo-reminders.queue.ts
    errors/
      todo.infrastructure-errors.ts

  todos.module.ts
```

### Why this structure works

It keeps all feature concerns together while maintaining layer boundaries. A developer can enter `features/todos` and see the whole feature without hunting through global folders.

---

## 8. Domain layer guide

The domain layer is the business core.

### Put here

- entities and aggregates
- value objects
- domain events
- domain errors
- domain services with pure business logic

### Example entity

```ts
// domain/entities/todo.entity.ts
export class Todo {
  constructor(
    public readonly id: string,
    public readonly ownerId: string,
    public title: string,
    public done: boolean,
  ) {}

  static create(input: { id: string; ownerId: string; title: string }) {
    if (!input.title.trim()) {
      throw new InvalidTodoTitleError()
    }

    return new Todo(input.id, input.ownerId, input.title, false)
  }

  complete() {
    if (this.done) {
      throw new TodoAlreadyCompletedError()
    }

    this.done = true
  }
}
```

### Example domain errors

```ts
// domain/errors/todo.errors.ts
export class InvalidTodoTitleError extends Error {
  constructor() {
    super('Todo title is invalid')
    this.name = 'InvalidTodoTitleError'
  }
}

export class TodoAlreadyCompletedError extends Error {
  constructor() {
    super('Todo is already completed')
    this.name = 'TodoAlreadyCompletedError'
  }
}
```

### Domain rules

- no Hono imports
- no DB imports
- no Zod route schemas
- no provider SDKs
- no Redis/BullMQ

The domain should be plain TypeScript and business semantics.

---

## 9. Application layer guide

The application layer is where use cases live.

### Commands

Commands change state.

Example:

```ts
// application/commands/create-todo.command.ts
export async function createTodo(
  deps: {
    todoRepository: TodoRepository
    idGen: () => string
  },
  input: {
    ownerId: string
    title: string
  }
) {
  const todo = Todo.create({
    id: deps.idGen(),
    ownerId: input.ownerId,
    title: input.title,
  })

  await deps.todoRepository.save(todo)

  return todo
}
```

### Queries

Queries read state.

```ts
// application/queries/list-todos.query.ts
export async function listTodos(
  deps: { todoRepository: TodoRepository },
  input: { ownerId: string }
) {
  return deps.todoRepository.findByOwner(input.ownerId)
}
```

### Ports

Ports are application-owned interfaces.

```ts
// application/ports/todo-repository.port.ts
export interface TodoRepository {
  findById(id: string, tx?: TransactionContext): Promise<Todo | null>
  findByOwner(ownerId: string, tx?: TransactionContext): Promise<Todo[]>
  save(todo: Todo, tx?: TransactionContext): Promise<void>
}
```

### Application services

Use these for shared use-case logic that is not pure domain logic.

Good examples:

- permission checks reused in several commands
- shared policy evaluation requiring several ports
- bulk operation progress handling

Bad examples:

- giant `TodoService` with all feature logic inside it

### Sagas

Put long-running workflow orchestration here.

Examples:

- checkout flow
- import flow
- report generation flow
- AI multi-step agent flow

### Application layer rules

- depends on domain
- owns ports
- does not depend on transport
- does not depend on concrete infrastructure

---

## 10. Transport layer guide

The transport layer adapts external requests to use cases.

### HTTP structure

Recommended structure:

```text
transport/http/
  routes/
    todos.routes.ts
    todos-admin.routes.ts
  middleware/
    require-auth.ts
    require-todo-owner.ts
  schemas/
    create-todo.http.schema.ts
    update-todo.http.schema.ts
```

### Route conventions

A route file should:

- group related endpoints
- validate request input
- read request context
- call application use cases
- map result to response DTO/view

A route file should not:

- build SQL queries
- contain business state transitions
- make provider calls directly

### Example route

```ts
// transport/http/routes/todos.routes.ts
export function createTodosRoutes(deps: TodosHttpDeps) {
  const app = new Hono()

  app.use('*', requireAuth(deps.auth))

  app.post('/', async (c) => {
    const body = await c.req.json()
    const input = CreateTodoHttpSchema.parse(body)
    const auth = c.get('auth') as { userId: string }

    const todo = await createTodo(
      {
        todoRepository: deps.todoRepository,
        idGen: deps.idGen,
      },
      {
        ownerId: auth.userId,
        title: input.title,
      }
    )

    return c.json(toTodoView(todo), 201)
  })

  app.get('/', async (c) => {
    const auth = c.get('auth') as { userId: string }
    const todos = await listTodos(
      { todoRepository: deps.todoRepository },
      { ownerId: auth.userId }
    )

    return c.json(todos.map(toTodoView))
  })

  return app
}
```

### Middleware = guards/interceptors

Use Hono middleware for:

- auth
- request IDs
- logging
- idempotency
- owner/resource preloading
- rate limiting
- error handling

Treat middleware as the Hono replacement for guards and interceptors.

### RPC structure

Use `transport/rpc` for oRPC routers if the feature exposes typed procedures.

---

## 11. Infrastructure layer guide

This layer implements the ports.

### Repository implementation example

```ts
// infrastructure/repositories/drizzle-todo.repository.ts
export class DrizzleTodoRepository implements TodoRepository {
  constructor(private readonly db: DbClient) {}

  async findById(id: string): Promise<Todo | null> {
    const row = await this.db.query.todos.findFirst({
      where: (todos, { eq }) => eq(todos.id, id),
    })

    if (!row) return null

    return new Todo(row.id, row.ownerId, row.title, row.done)
  }

  async findByOwner(ownerId: string): Promise<Todo[]> {
    const rows = await this.db.query.todos.findMany({
      where: (todos, { eq }) => eq(todos.ownerId, ownerId),
    })

    return rows.map((row) => new Todo(row.id, row.ownerId, row.title, row.done))
  }

  async save(todo: Todo): Promise<void> {
    await this.db.insert(schema.todos)
      .values({
        id: todo.id,
        ownerId: todo.ownerId,
        title: todo.title,
        done: todo.done,
      })
      .onConflictDoUpdate({
        target: schema.todos.id,
        set: {
          title: todo.title,
          done: todo.done,
        },
      })
  }
}
```

### Infrastructure rules

- it can import DB clients, SDKs, providers
- it can translate rows/payloads into domain entities
- it should not contain transport concerns
- it should not own business policies

---

## 12. Models, DTOs, rows, provider payloads

These are not the same thing.

### Domain entity

Internal business model.

Example:

```ts
Todo
CheckoutSession
User
```

### Request DTO / input schema

External input shape.

Example:

```ts
CreateTodoInput
StartCheckoutInput
```

### Response DTO / view

External output shape.

Example:

```ts
TodoView
CheckoutSessionView
```

### Persistence row

How data is stored.

Example:

```ts
TodoRow
CheckoutSessionRow
```

### Provider payload

Third-party API shape.

Example:

```ts
StripeCheckoutSessionResponse
OpenAIEmbeddingResponse
```

### Rule

Never treat these as the same thing just because they look similar.

Use mappers.

---

## 13. Mappers

Mappers keep boundaries clean.

### Good places for mappers

- `application/mappers` for entity -> view or use-case output mapping
- `infrastructure/repositories` for row -> entity mapping helpers
- `infrastructure/providers` for provider payload -> domain/app mapping

### Example

```ts
// application/mappers/todo-view.mapper.ts
export type TodoView = {
  id: string
  title: string
  done: boolean
}

export function toTodoView(todo: Todo): TodoView {
  return {
    id: todo.id,
    title: todo.title,
    done: todo.done,
  }
}
```

### Mapping rule

If a boundary changes shape, make the transformation explicit.

---

## 14. Errors and error propagation

Use layered errors.

### Domain errors

Thrown by entities/value objects/domain services.

Examples:

- `TodoAlreadyCompletedError`
- `InvalidMoneyAmountError`

### Application errors
n
Created when the problem is about the use case/workflow rather than the pure domain.

Examples:

- `TodoNotFoundError`
- `UnauthorizedTodoActionError`
- `BulkOperationAlreadyRunningError`

### Infrastructure errors

Raised when external adapters fail.

Examples:

- `StorageUploadFailedError`
- `BillingProviderTimeoutError`

### Transport mapping

App-wide Hono error middleware should map errors to responses.

Example policy:

- domain validation -> `400` or `422`
- unauthorized -> `401` or `403`
- missing entity -> `404`
- conflict -> `409`
- infra transient failure -> `503`
- unknown -> `500`

### Logging rule

Log full error detail internally, expose only safe public messages externally.

---

## 15. Transactions and unit of work

Transactions belong in the application layer, not in routes.

### Use a `UnitOfWork` port

```ts
export interface UnitOfWork {
  run<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T>
}
```

### Repositories should accept tx context when needed

```ts
export interface TodoRepository {
  save(todo: Todo, tx?: TransactionContext): Promise<void>
}
```

### Command with transaction

```ts
export async function completeTodo(
  deps: {
    uow: UnitOfWork
    todoRepository: TodoRepository
    jobBus: JobBus
  },
  input: { todoId: string; actorId: string }
) {
  await deps.uow.run(async (tx) => {
    const todo = await deps.todoRepository.findById(input.todoId, tx)
    if (!todo) throw new TodoNotFoundError()
    if (todo.ownerId !== input.actorId) throw new UnauthorizedTodoActionError()

    todo.complete()
    await deps.todoRepository.save(todo, tx)

    await deps.jobBus.enqueue('notifications', 'todo.completed', {
      todoId: todo.id,
      ownerId: todo.ownerId,
    })
  })
}
```

### Rule

Routes should never open DB transactions directly.

---

## 16. Outbox, jobs, and sagas

These concepts are related, but not the same.

### Normal command

A synchronous use case that usually finishes in one request.

### Job

A durable async execution unit. Good for retries, backoff, long work, provider interaction.

### Saga

A workflow coordinator spanning multiple steps, often across multiple transactions or jobs.

### Outbox

A reliability pattern used when a DB commit must reliably trigger downstream async work.

#### Recommended flow

1. command updates state in DB
2. command writes outbox record in same transaction
3. publisher/worker reads outbox after commit
4. queue/event is emitted

### Rule of thumb

- use **commands** for local business actions
- use **jobs** for async durable execution
- use **sagas** for multi-step workflows
- use **outbox** when DB state and downstream async work must stay consistent

---

## 17. Use cases vs services

This is a common source of confusion.

### Prefer use cases as the main entrypoints

- one command/query per operation
- keep them explicit and narrow

### Use services only when justified

Good service examples:

- `BillingEligibilityService`
- `TodoAuthorizationService`
- `ReportFormattingService`

Bad service examples:

- `TodoService` with every feature method inside it
- `UserService` as a junk drawer

### Heuristic

If logic corresponds to “the thing the system does”, use a command/query.
If logic is a reusable policy/helper used by several use cases, use a service.

---

## 18. Naming conventions

Use explicit filenames.

### Entities

- `todo.entity.ts`
- `checkout-session.entity.ts`

### Value objects

- `email.vo.ts`
- `money.vo.ts`

### Ports

- `todo-repository.port.ts`
- `storage.port.ts`
- `job-bus.port.ts`

### Repository implementations

- `drizzle-todo.repository.ts`
- `pg-checkout-session.repository.ts`

### Commands / queries

- `create-todo.command.ts`
- `list-todos.query.ts`
- `start-checkout.command.ts`

### Services

- `todo-authorization.service.ts`
- `pricing-policy.service.ts`

### Routes

- `todos.routes.ts`
- `billing.routes.ts`

### Schemas

- `create-todo.http.schema.ts`
- `todo.view.schema.ts`

### Mappers

- `todo-view.mapper.ts`
- `checkout-session-view.mapper.ts`

### Errors

- `todo.errors.ts`
- `todo.application-errors.ts`
- `todo.infrastructure-errors.ts`

### Sagas

- `checkout.saga.ts`
- `bulk-import.saga.ts`

### Naming style rules

- use singular for entities/value objects
- use plural for route groups/resources
- use kebab-case filenames
- include suffixes like `.entity`, `.port`, `.service`, `.routes`, `.schema`, `.mapper`

---

## 19. Request lifecycle: end-to-end example

Example: `POST /todos`

### Step 1: route receives request

Hono route reads JSON body.

### Step 2: input validation

Transport schema validates request.

### Step 3: auth context

Middleware has already resolved the current actor and stored it in Hono context.

### Step 4: command execution

Route calls `createTodo(...)`.

### Step 5: domain construction

Command calls `Todo.create(...)`.

### Step 6: persistence

Command calls `todoRepository.save(...)`.

### Step 7: mapping

Route maps returned entity to `TodoView`.

### Step 8: response

Hono returns JSON response.

### Step 9: cross-cutting concerns

Logging, traces, metrics, and error handling happen via middleware.

That is the baseline lifecycle for most features.

---

## 20. Full end-to-end example module

### File tree

```text
features/todos/
  domain/
    entities/
      todo.entity.ts
    errors/
      todo.errors.ts
  application/
    commands/
      create-todo.command.ts
    queries/
      list-todos.query.ts
    ports/
      todo-repository.port.ts
    mappers/
      todo-view.mapper.ts
  transport/
    http/
      routes/
        todos.routes.ts
      middleware/
        require-auth.ts
      schemas/
        create-todo.http.schema.ts
  infrastructure/
    repositories/
      drizzle-todo.repository.ts
  todos.module.ts
```

### Transport schema

```ts
// transport/http/schemas/create-todo.http.schema.ts
import { z } from 'zod'

export const CreateTodoHttpSchema = z.object({
  title: z.string().min(1),
})

export type CreateTodoHttpInput = z.infer<typeof CreateTodoHttpSchema>
```

### Domain entity

```ts
// domain/entities/todo.entity.ts
import { InvalidTodoTitleError } from '../errors/todo.errors'

export class Todo {
  constructor(
    public readonly id: string,
    public readonly ownerId: string,
    public title: string,
    public done: boolean,
  ) {}

  static create(input: { id: string; ownerId: string; title: string }) {
    if (!input.title.trim()) throw new InvalidTodoTitleError()
    return new Todo(input.id, input.ownerId, input.title, false)
  }
}
```

### Port

```ts
// application/ports/todo-repository.port.ts
import type { Todo } from '../../domain/entities/todo.entity'

export interface TodoRepository {
  findByOwner(ownerId: string): Promise<Todo[]>
  save(todo: Todo): Promise<void>
}
```

### Command

```ts
// application/commands/create-todo.command.ts
import { Todo } from '../../domain/entities/todo.entity'
import type { TodoRepository } from '../ports/todo-repository.port'

export async function createTodo(
  deps: {
    todoRepository: TodoRepository
    idGen: () => string
  },
  input: {
    ownerId: string
    title: string
  }
) {
  const todo = Todo.create({
    id: deps.idGen(),
    ownerId: input.ownerId,
    title: input.title,
  })

  await deps.todoRepository.save(todo)

  return todo
}
```

### Mapper

```ts
// application/mappers/todo-view.mapper.ts
import type { Todo } from '../../domain/entities/todo.entity'

export function toTodoView(todo: Todo) {
  return {
    id: todo.id,
    title: todo.title,
    done: todo.done,
  }
}
```

### Repository implementation

```ts
// infrastructure/repositories/drizzle-todo.repository.ts
import type { TodoRepository } from '../../application/ports/todo-repository.port'
import { Todo } from '../../domain/entities/todo.entity'

export class DrizzleTodoRepository implements TodoRepository {
  constructor(private readonly db: DbClient) {}

  async findByOwner(ownerId: string): Promise<Todo[]> {
    const rows = await this.db.query.todos.findMany({
      where: (todos, { eq }) => eq(todos.ownerId, ownerId),
    })

    return rows.map((row) => new Todo(row.id, row.ownerId, row.title, row.done))
  }

  async save(todo: Todo): Promise<void> {
    await this.db.insert(schema.todos).values({
      id: todo.id,
      ownerId: todo.ownerId,
      title: todo.title,
      done: todo.done,
    })
  }
}
```

### Routes

```ts
// transport/http/routes/todos.routes.ts
import { Hono } from 'hono'
import { CreateTodoHttpSchema } from '../schemas/create-todo.http.schema'
import { createTodo } from '../../../application/commands/create-todo.command'
import { listTodos } from '../../../application/queries/list-todos.query'
import { toTodoView } from '../../../application/mappers/todo-view.mapper'

export function createTodosRoutes(deps: {
  todoRepository: TodoRepository
  auth: AuthServices
  idGen: () => string
}) {
  const app = new Hono()

  app.use('*', requireAuth(deps.auth))

  app.post('/', async (c) => {
    const body = await c.req.json()
    const input = CreateTodoHttpSchema.parse(body)
    const auth = c.get('auth') as { userId: string }

    const todo = await createTodo(
      {
        todoRepository: deps.todoRepository,
        idGen: deps.idGen,
      },
      {
        ownerId: auth.userId,
        title: input.title,
      }
    )

    return c.json(toTodoView(todo), 201)
  })

  app.get('/', async (c) => {
    const auth = c.get('auth') as { userId: string }

    const todos = await listTodos(
      { todoRepository: deps.todoRepository },
      { ownerId: auth.userId }
    )

    return c.json(todos.map(toTodoView))
  })

  return app
}
```

### Module factory

```ts
// todos.module.ts
export function createTodosModule(deps: AppDeps) {
  const todoRepository = new DrizzleTodoRepository(deps.db)

  return {
    routes: createTodosRoutes({
      todoRepository,
      auth: deps.auth,
      idGen: deps.idGen,
    }),
  }
}
```

This is the pattern to repeat across the backend.

---

## 21. Testing strategy by layer

### Domain tests

Fast pure unit tests.

### Application tests

Use fake ports or in-memory test adapters.

### Transport tests

Test Hono routes with mocked feature dependencies.

### Infrastructure tests

Integration tests against real Postgres/Redis/test containers when needed.

### Workflow tests

Test sagas/jobs with deterministic fixtures and idempotency assertions.

---

## 22. Common mistakes to avoid

- putting business logic in routes
- using one giant service per feature
- leaking DB rows upward as domain models
- using DTOs as entities
- turning `shared/` into a junk drawer
- over-injecting giant dependency objects everywhere
- calling providers directly from controllers/routes
- skipping mappers because “the shapes are the same for now”
- running long work inside HTTP handlers instead of jobs/sagas
- hiding transaction boundaries in infrastructure instead of application code

---

## 23. Implementation checklist for a new module

When creating a new feature module:

1. Create the feature folder with `domain`, `application`, `transport`, `infrastructure`
2. Add entities, domain errors, and any value objects
3. Define use cases as commands/queries
4. Define ports needed by the use cases
5. Add mappers for output/view shapes
6. Create route schemas and route files
7. Implement repositories/providers in infrastructure
8. Add `<feature>.module.ts` factory
9. Register the module in `build-app.ts`
10. Add tests for domain, application, and transport
11. If async work is needed, add jobs/sagas/outbox flow
12. Follow naming conventions strictly

---

## 24. Final summary

The complete architecture can be summarized like this:

- Hono is the outer HTTP shell
- apps are deployable execution surfaces
- features are business modules
- each feature follows domain/application/transport/infrastructure
- use cases are the main business entrypoints
- services exist only when they own meaningful shared logic
- ports are application-owned interfaces
- infrastructure implements the ports
- routes adapt requests into use-case calls
- DTOs/contracts are separate from domain entities
- mappers keep boundaries clean
- transactions live in application use cases
- outbox, jobs, and sagas handle durable workflows
- naming and folder conventions are explicit and stable

That gives you a system that feels structured like a strong Nest codebase, but without depending on a DI container or framework-owned module graph.
