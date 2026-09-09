# Plugin Development Standards

Use this guide for backend/frontend plugin development, plugin manifests, hooks, SQL scripts, and plugin README files. For public sharing, publishing, marketplace PRs, submodules, and update workflows, read `plugin-sharing.md`.

## Plugin Types

### App-level Plugin

An app-level plugin is injected into the system like a normal application. In fba, first-level folders under `app` are treated as applications, and the same rule applies to app-level plugins.

App-level plugins must follow the normal route structure completely.

```toml
[app]
router = ['v1']
```

### Extend-level Plugin

An extend-level plugin is injected into an existing application under the `app` directory.

Extend-level plugins must copy the target application's `api` directory structure 1:1.

```toml
[app]
extend = 'admin'
```

### Capability-level Plugin

A capability-level plugin does not inject routes. It provides importable capabilities for other plugins or application code, such as utilities, SDK wrappers, providers, adapters, or reusable capability packages.

Capability-level plugins omit both `[app]` and `[api]`.

```toml
[plugin]
summary = 'AI tools'
version = '1.0.0'
description = 'Reusable AI capabilities'
author = 'Author'
tags = ['ai']
```

## Plugin Route Injection

If an app-level or extend-level plugin satisfies the plugin development requirements, its routes are automatically injected into the FastAPI application.

Startup time can increase as the number of plugins grows because fba parses all plugins in real time before each startup.

### App-level Routes

Develop routes according to the standard fba route structure.

### Extend-level Routes

Replicate the existing application's `api` directory structure 1:1. For example, the built-in `notice` plugin extends an existing application by mirroring its API layout.

### Capability-level Routes

Do not create route injection for capability-level plugins. Other code should import and use the plugin's modules directly.

## Database Compatibility

Official fba implementations support both MySQL and PostgreSQL.

App-level and extend-level plugins must declare supported databases in `plugin.toml`. Capability-level plugins can omit `plugin.database` when they do not contain models or SQL.

For cross-database SQLAlchemy compatibility, use SQLAlchemy 2.0 mechanisms such as `TypeDecorator` and `with_variant`.

## Backend Plugin Directory Structure

Plugins are placed under `backend/plugin`.

```text
xxx                             # Plugin name
├── api                         # API routes, required for app-level and extend-level plugins
├── crud                        # CRUD
├── model                       # Models
│   ├── __init__.py             # Import all model classes here
│   └── ...
├── schema                      # Data transfer schemas
├── service                     # Services
├── sql                         # Recommended when the plugin executes SQL
│   ├── mysql
│   │   ├── destroy.sql         # Auto-increment ID cleanup, executed on uninstall
│   │   ├── destroy_snowflake.sql # Snowflake ID cleanup
│   │   ├── init.sql            # Auto-increment ID initialization, executed on install
│   │   └── init_snowflake.sql  # Snowflake ID initialization
│   └── postgresql
│       └── ...                 # Same file names as mysql
├── utils                       # Utilities
├── .env.example                # Environment variables
├── __init__.py                 # Kept as a Python package
├── ...                         # More content, e.g. enums.py
├── hooks.py                    # Optional plugin hook functions
├── plugin.toml                 # Plugin configuration file
├── README.md                   # Usage instructions and contact information
└── requirements.txt            # Dependency packages
```

## plugin.toml Configuration

Every plugin must contain `plugin.toml`.

### Common Plugin Metadata

```toml
[plugin]
# Icon path inside the plugin repository or an icon URL
icon = 'assets/icon.svg'
# Short summary
summary = 'Short summary'
# Version
version = '0.0.1'
# Description
description = 'Detailed description'
# Author
author = 'Author'
# Supported tags: ai, mcp, agent, auth, storage, notification, task, payment, other
tags = ['other']
# Supported databases: mysql, postgresql.
# Required for app-level and extend-level plugins.
# Optional for capability-level plugins without models.
# database = ['postgresql']
# Optional backend plugin startup dependencies
# depends_on = ['dict']
```

Use real, non-empty metadata before validation. `summary`, `description`, `author`, `tags`, and `database` are required for backend plugins, and `version` must be semver (`x.y.z`).

### App-level Plugin Configuration

```toml
# Plugin metadata
[plugin]
icon = 'assets/icon.svg'
summary = 'Short summary'
version = '0.0.1'
description = 'Detailed description'
author = 'Author'
tags = ['other']
database = ['postgresql']
# depends_on = ['dict']

# Application configuration
[app]
# Final router instance names.
# See backend/app/admin/api/router.py; usually named v1.
router = ['v1']

# Code-level configuration keys in uppercase.
# Optional. See Hot-pluggable Configuration.
[settings]
XXX = 'value'
```

### Extend-level Plugin Configuration

```toml
# Plugin metadata
[plugin]
icon = 'assets/icon.svg'
summary = 'Short summary'
version = '0.0.1'
description = 'Detailed description'
author = 'Author'
tags = ['other']
database = ['postgresql']
# depends_on = ['dict']

# Application configuration
[app]
# Target application folder name
extend = 'application_folder_name'

# API configuration
[api.xxx]
# xxx is the file name under the plugin api directory without extension.
# Example: for notice.py, use [api.notice].
# Multiple API files require multiple [api.xxx] sections.
# Route prefix, must start with '/'.
prefix = ''
# Tags for Swagger documentation
tags = ''

# Code-level configuration keys in uppercase.
# Optional. See Hot-pluggable Configuration.
[settings]
XXX = 'value'
```

### Capability-level Plugin Configuration

```toml
# Plugin metadata
[plugin]
icon = 'assets/icon.svg'
summary = ''
version = ''
description = ''
author = ''
tags = ['']
# depends_on = ['dict']

# Code-level configuration keys in uppercase.
# Optional. See Hot-pluggable Configuration.
[settings]
XXX = 'value'
```

## Manifest Validation and Runtime Behavior

Backend plugin manifests are validated at startup and install time. Keep these rules aligned with `.schemas/plugin.schema.json` and `backend/plugin/validator.py`.

- `plugin.version` must use `x.y.z` semver format, such as `1.0.0`.
- `plugin.tags` must be one or more of `ai`, `mcp`, `agent`, `auth`, `storage`, `notification`, `task`, `payment`, `other`.
- `plugin.database` must be one or more of `mysql`, `postgresql` when present.
- App-level and extend-level plugins require `plugin.database`; capability-level plugins without models can omit it.
- `plugin.depends_on` is optional. Use plugin folder names, never include the plugin itself, and avoid cycles.
- App-level plugins use `[app].router`; extend-level plugins use `[app].extend` plus at least one `[api.<filename>]` block.
- Capability-level plugins omit both `[app]` and `[api]`; they can still use `[settings]`.
- `[api.<filename>]` keys must match plugin `api` Python file names without `.py`. Prefixes must start with `/` and contain only letters, digits, `_`, `-`, and `/`.
- `[settings]` keys must be uppercase and values should be strings, numbers, or booleans.

If a backend plugin has a `model/` directory, declare `plugin.database` and provide complete SQL scripts for at least one supported database. Keep `[plugin].database` aligned with the database directories that are actually complete:

```text
sql/<mysql|postgresql>/init.sql
sql/<mysql|postgresql>/destroy.sql
sql/<mysql|postgresql>/init_snowflake.sql
sql/<mysql|postgresql>/destroy_snowflake.sql
```

Runtime behavior to account for:

- A backend plugin directory is discovered only when it is under `backend/plugin` and contains `__init__.py`.
- Capability-level plugins are cached and listed like other backend plugins, but they are not included in route injection.
- ZIP installation requires the archive to contain a top-level plugin directory with `plugin.toml` and `README.md`; the installer extracts the contents into `backend/plugin/<plugin_name>`.
- Git installation accepts HTTP/HTTPS Git repository URLs and installs the repository folder name as the plugin name.
- When `.env.example` exists, its content is appended to the project's backend `.env` during installation.
- `requirements.txt` is installed with `uv pip install -r ... --prerelease=allow`; keep dependencies minimal and pinned when compatibility matters.

## Global Configuration

fba uses one global configuration file, similar to Django.

During development, add plugin global configuration to `backend/core/conf.py` for typing hints and explicit configuration management.

```python
##################################################
# [ Plugin ] email
##################################################
# .env
EMAIL_USERNAME: str
EMAIL_PASSWORD: str

# Basic configuration
EMAIL_HOST: str
EMAIL_PORT: int
EMAIL_SSL: bool
EMAIL_CAPTCHA_REDIS_PREFIX: str
EMAIL_CAPTCHA_EXPIRE_SECONDS: int
```

The structure should contain:

1. Plugin configuration comment block.
2. Plugin environment variable declarations and comments.
3. Plugin basic configuration declarations and comments.

Published plugins cannot modify the user's `backend/core/conf.py` directly. Document required global configuration in the plugin `README.md`.

## Hot-pluggable Configuration

Since fba v1.13.0, plugins can adapt to hot-pluggable installation when configured correctly.

### Plugin Environment Variables

If the plugin requires environment variables, add `.env.example` in the plugin root directory.

```dotenv
# [ Plugin ] email
EMAIL_USERNAME=''
EMAIL_PASSWORD=''
```

### Plugin Basic Configuration

If the plugin requires basic configuration, add uppercase configuration keys under `[settings]` in `plugin.toml`.

Do not confuse `plugin.toml` settings with `backend/core/conf.py` declarations. Their formats are different.

```toml
[settings]
EMAIL_HOST = 'smtp.qq.com'
EMAIL_PORT = 465
EMAIL_SSL = true
EMAIL_CAPTCHA_REDIS_PREFIX = 'fba:email:captcha'
EMAIL_CAPTCHA_EXPIRE_SECONDS = 180
```

After `.env.example` and `[settings]` are configured, plugins installed through CLI or Git can adapt to hot-pluggable behavior without extra manual changes, provided the plugin has no additional integration requirements. Users still need to replace placeholder values appended from `.env.example`.

### Global Configuration Priority

The final effective configuration priority flows in this order:

```text
Dynamic configuration -> system environment variables -> .env -> plugin [settings] -> conf.py defaults
```

`Settings.settings_customise_sources()` resolves only the static chain from system environment variables through `conf.py` defaults. Dynamic configuration is an on-demand runtime override layer and is not a Pydantic Settings source.

Only integrate a plugin with dynamic configuration when its business settings must be changed through parameter management while the system is running. The loader must use an explicit field-to-converter mapping and run before the corresponding settings are read.

See `references/config.md` for the complete source responsibilities and dynamic configuration loading rules.

Development recommendation:

- Add global configuration declarations in `backend/core/conf.py` during development.
- Document those declarations in the published plugin `README.md`.
- Use this approach when IDE typing hints are important for plugin developers or users.

## Hook Functions

Plugins may define optional hook functions in root-level `hooks.py`. Hooks run only for enabled route-injectable plugins, and fba loads hook modules after resolving `plugin.depends_on`.

fba also provides helper functions in `backend/plugin/patching.py` for plugin configuration. Use helpers such as `replace_middleware` from `setup` when a plugin must adapt application middleware.

### lifespan

Define a FastAPI lifespan function. fba registers it in the plugin lifespan stage before application startup.

### setup

Define startup logic as `setup(app: FastAPI)`. Sync and async setup functions are supported and run before application startup.

### otel

Define OpenTelemetry setup as `otel(app: FastAPI)`. Sync and async functions are supported and run during plugin OpenTelemetry initialization.

## Frontend Plugin Directory Structure

Frontend plugins are placed under `apps/web-antdv-next/src/plugins`.

```text
xxx                             # Plugin name
├── api                         # API client code
│   └── index.ts
├── langs                       # I18n resources
│   ├── en-US
│   │   └── plugin_name.json
│   └── zh-CN
│       └── plugin_name.json
├── public
│   └── images                  # Page preview images
├── routes                      # Routes
│   └── index.ts
├── views                       # Views
│   ├── index.vue
│   └── ...
├── ...                         # More content
└── plugin.toml                 # Plugin configuration file
```

## Frontend plugin.toml Configuration

Every frontend plugin must contain `plugin.toml`.

```toml
[plugin]
# Icon path inside the plugin repository or an icon URL
icon = 'assets/icon.svg'
# Short summary
summary = 'Short summary'
# Version
version = '0.0.1'
# Description
description = 'Detailed description'
# Author
author = 'Author'
# Supported tags: ai, mcp, agent, auth, storage, notification, task, payment, other
tags = ['other']
```

## Plugin Sharing

Read `plugin-sharing.md` before helping with any of these tasks:

- Preparing a backend or frontend plugin repository for public sharing
- Publishing a plugin to the fba plugin marketplace
- Updating an existing marketplace plugin submodule
- Checking repository naming, HTTPS submodule URLs, or PR readiness

## Plugin README Convention

When creating, reviewing, or updating a plugin `README.md`, follow these rules strictly.

Use the canonical plugin README style represented by the `ai` plugin README.

### Required Structure

A plugin `README.md` must contain only the following content, in this order:

1. Title
2. Description
3. Plugin type
4. Configuration
5. Configuration item descriptions when `[settings]` is present
6. Usage
7. Uninstall
8. Contact

Use the exact section headings and fixed labels from the canonical output contract below.

### Canonical Output Contract

The generated plugin `README.md` must use this exact localized structure and fixed labels:

````md
# <Plugin display name>

<Short description>

## 插件类型

- <应用级插件 or 扩展级插件 or 能力型插件>

## 配置说明

在 `backend/.env` 中添加以下内容：

```env
<backend/.env variables>
```

插件目录下 `plugin.toml` 的 `[settings]` 中包含以下内容：

```toml
[settings]
<plugin settings>
```

在 `backend/core/conf.py` 中添加以下内容：

```python
##################################################
# [ Plugin ] <plugin_name>
##################################################
# .env
<env field definitions>

# 基础配置（in plugin.toml）
<plugin.toml setting field definitions>
```

当前项目的 `backend/core/conf.py` 已包含以下字段：

```python
<existing plugin field definitions>
```

## 配置项说明

- `<PLUGIN_SETTING>`：<用途说明>

## 使用方式

1. <core usage step>

## 卸载说明

- <cleanup item>

## 联系方式

- 作者：`<author>`
- 反馈方式：提交 Issue 或 PR
````

Use only the configuration lead-in lines that apply to real content.

Use either the `backend/core/conf.py` add-content lead-in or the already-present-fields lead-in, not both.

Every included configuration source must follow this exact pattern: lead-in sentence, one blank line, fenced code block, one blank line before the next configuration source.

### Section Rules

#### Title

Use the plugin display name as the H1 title.

Example:

```md
# OAuth2
```

#### Description

Place a short description immediately below the title.

Keep it concise and use this part to explain the plugin capabilities.

Capability summaries may be written as short paragraphs or short bullet lists directly under the title.

Do not create a separate feature section for plugin capabilities.

#### Plugin Type

Use the exact heading from the canonical output contract.

Only describe the plugin type.

Use a short bullet list with the exact canonical plugin type wording.

For extend-level plugins, include the target app name such as `admin` when useful.

For capability-level plugins, use `能力型插件`.

Do not include route prefixes, API mount paths, or endpoint information.

#### Configuration

Use the exact heading from the canonical output contract.

The configuration section must contain only canonical configuration blocks.

Do not add an overview sentence before the first configuration block.

Always present configuration in this order:

1. What to add in `backend/.env`
2. What is contained in `[settings]` of the plugin directory `plugin.toml`
3. What to add in `backend/core/conf.py`, or which plugin fields are already present there

Only include configuration sources that actually have meaningful content.

Do not add no-op placeholder lines for omitted configuration sources.

Do not add explanatory prose before or after any configuration code block.

Do not add per-key descriptions, usage notes, defaults explanations, or conditional instructions in this section.

Use the exact configuration lead-in sentences from the canonical output contract for `.env`, `plugin.toml`, and `backend/core/conf.py` blocks.

Each configuration block must use the exact fenced code language from the canonical output contract:

- `env` for `backend/.env`
- `toml` for `plugin.toml`
- `python` for `backend/core/conf.py`

The `backend/.env` code block must contain only the variables that should be added to `backend/.env`.

The `plugin.toml` code block must include the `[settings]` header and only the settings from the plugin directory `plugin.toml`.

If the current project already contains the required plugin fields in `backend/core/conf.py`, state that directly before the code block.

When the plugin has corresponding fields in `backend/core/conf.py`, include the exact field definitions or explain that they are already present in the current project.

When you show `backend/core/conf.py` content, keep the actual plugin grouping style consistent with the real file, including separator comments, plugin-name comments, `.env` comments, and plugin basic-configuration comments when they exist.

Show only fields that belong to the current plugin in the `backend/core/conf.py` block.

Do not include unrelated global plugin fields such as installer, Redis prefix, or package-index settings in a plugin README.

Use direct instruction wording.

Avoid conditional phrasing such as `if needed`, `when enabled`, or localized equivalents in the configuration section.

For `plugin.toml`, use the canonical lead-in that says the plugin directory `plugin.toml` contains the following `[settings]` content rather than instructing the reader to add that content.

#### Configuration Item Descriptions

Include the exact `## 配置项说明` heading when the plugin's `plugin.toml` contains a non-empty `[settings]` table.

List every `[settings]` key exactly once and in the same order as `plugin.toml`.

Use this exact list-item format:

```md
- `<SETTING_NAME>`：<concise purpose>
```

Describe only what the setting controls or affects.

Do not repeat its type, default value, configuration source, or setup instructions.

Do not include environment-only variables or unrelated `backend/core/conf.py` fields in this section.

Omit the entire section when `[settings]` is absent or empty.

#### Usage

Use the exact heading from the canonical output contract.

Describe only the core usage flow in plain language.

Keep this section short and focused.

Do not list API endpoints, route prefixes, request paths, or interface details.

#### Uninstall

Use the exact heading from the canonical output contract.

Describe which related configuration should be removed and what integrations should be cleaned up.

Use high-level cleanup wording by default.

Do not enumerate specific configuration keys in the uninstall section unless the user explicitly asks for them.

Use short bullet lists for multiple cleanup items.

#### Contact

Use the exact heading from the canonical output contract.

Provide author and feedback entries with the exact fixed labels from the canonical output contract.

### Forbidden Content

Do not include the following in plugin `README.md` files:

- Route prefixes
- API endpoint lists
- Interface descriptions
- Feature sections
- Warning sections
- Note sections
- FAQ sections
- Extra headings outside the required structure
- Non-canonical English section headings such as `Plugin Type`, `Configuration`, `Usage`, `Uninstall`, or `Contact`
- Non-canonical English contact labels such as `Author:`

### Punctuation Rule

Do not end prose lines or list items with CJK full stop punctuation.

This rule does not apply to code blocks.

### Style Rule

Keep wording concise, direct, and operational.

Prefer short paragraphs and short numbered lists.

## Important Notes

Unless necessary, avoid referencing existing architecture methods from plugin code.

If existing architecture methods change, plugins that depend on those methods must be updated, otherwise they can break.
