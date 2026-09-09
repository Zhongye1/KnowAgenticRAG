---
name: fba
description: FastAPI Best Architecture (fba) project development guide. Use when working in fba projects to design, implement, review, or document APIs, Schema, Service, CRUD, Model, configuration, response contracts, pagination, cache, Celery, i18n, coding style, plugin development, plugin README files, plugin sharing, plugin publishing, or plugin marketplace updates.
---

# FastAPI Best Architecture

Official documentation: https://fastapi-practices.github.io/fastapi_best_architecture_docs/

Use this skill to follow fba architecture and plugin conventions. Read only the references needed for the task. For cross-layer feature work, read `references/development.md` first, then load the layer-specific references.

## Core Architecture

Project adopts a layered backend architecture centered on API, Service, and CRUD, with Schema and Model as explicit data contracts:

| Layer   | Responsibility                                                     |
|---------|--------------------------------------------------------------------|
| API     | Route processing, parameter validation, and response return        |
| Schema  | Data transfer objects, request/response data structure definitions |
| Service | Business logic, data processing, exception handling                |
| CRUD    | Database operations (inherits `CRUDPlus`)                          |
| Model   | ORM models (inherits `Base`)                                       |

## Development Workflow

1. Define database models (model)
2. Define data validation models (schema)
3. Define routes (router)
4. Write business logic (service)
5. Write database operations (crud)

## Reference Selection

| Task | Read |
|------|------|
| Feature/module development flow, Service/CRUD placement, pagination, cache, Celery, i18n, code generation | `references/development.md` |
| API routes, dependencies, response patterns, auth, permissions | `references/api.md` |
| Pydantic request/response DTOs | `references/schema.md` |
| SQLAlchemy models and migrations | `references/model.md` |
| CRUD, Service, API, Schema naming | `references/naming.md` |
| Backend/frontend plugin development and plugin README files | `references/plugin.md` |
| Plugin sharing, public repositories, marketplace PRs, submodules, updates | `references/plugin-sharing.md` |
| Formatting, comments, docstrings, commit style | `references/coding-style.md` |
| Global settings and configuration | `references/config.md` |

## Plugin Work

When creating, reviewing, or updating plugins:

1. Read `references/plugin.md` for plugin type, structure, manifest, configuration, hooks, SQL, and README rules
2. Read `references/plugin-sharing.md` when the task involves sharing, publishing, updating, marketplace PRs, plugin repositories, or Git submodules
3. Prefer source-code behavior from `fastapi-best-architecture` when docs and implementation differ
4. Do not perform git add, commit, push, or PR actions unless the user explicitly asks

## CLI

Execute `fba -h` for more details.
