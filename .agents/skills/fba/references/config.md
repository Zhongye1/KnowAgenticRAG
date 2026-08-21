# Configuration Reference

Configuration file location: `backend/core/conf.py`.

Configurations marked as environment variables in the docs should be supplied through the system environment or `backend/.env`.

## Configuration Model

fba has two configuration stages:

1. Static configuration is resolved when the global `Settings` instance is created.
2. Dynamic configuration is loaded on demand during business execution and overrides selected fields on the existing `settings` singleton.

The final effective priority is:

```text
Dynamic configuration -> system environment variables -> .env -> plugin [settings] -> conf.py defaults
```

Dynamic configuration is a runtime override layer, not a Pydantic Settings source.

## Static Source Priority

`Settings.settings_customise_sources()` resolves configuration in this order:

```text
System environment variables -> .env -> plugin [settings] -> conf.py defaults
```

Earlier sources override later sources. Plugin `[settings]` values are fallback defaults for hot-pluggable plugins, not a higher-priority override of `.env`.

## Source Responsibilities

- System environment variables: container, CI/CD, and production deployment injection; use for secrets, connection data, and deployment differences.
- `.env`: local or single-host environment configuration; do not commit real secrets.
- Plugin `[settings]`: non-secret, public, hot-pluggable plugin defaults.
- `conf.py`: typed field declarations, validation, and built-in defaults; treat it as the global configuration contract.
- Dynamic configuration: business settings that must be adjusted at runtime through parameter management.

## General Rules

- Keep project-wide application and plugin settings in `backend/core/conf.py` for explicit typing and IDE support.
- Keep secrets and deploy-time values in environment variables or `backend/.env`.
- Do not change `DATABASE_PK_MODE` after data exists unless you also plan and test the full migration path.
- `DATABASE_TYPE` supports `mysql` and `postgresql`; third-party plugins should declare and test the databases they support.
- Avoid inventing core settings that do not exist in the base project, such as `TENANT_*`, unless the current project or plugin actually defines them.

## Plugin Settings

For hot-pluggable plugins:

- Put required environment variable placeholders in the plugin root `.env.example` as dotenv assignments.
- Put non-secret defaults in the plugin `plugin.toml` `[settings]` table with uppercase keys.
- Document the purpose of every `[settings]` key in the plugin `README.md` under `## 配置项说明`.
- Document the corresponding `backend/core/conf.py` type declarations in the plugin `README.md`.
- During development, adding typed fields to `backend/core/conf.py` is recommended for IDE hints; published plugins cannot modify the user's file directly.

## Common Paths

- Main configuration: `backend/core/conf.py`
- Environment file: `backend/.env`
- Environment template: `backend/.env.example`
- Plugin settings source: `backend/plugin/settings_source.py`
- Dynamic configuration loader: `backend/utils/dynamic_config.py`
- Dynamic configuration storage and management: `backend/plugin/config`
