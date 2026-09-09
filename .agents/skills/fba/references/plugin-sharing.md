# Plugin Sharing and Marketplace Publishing

Use this guide when preparing an fba plugin for public sharing, publishing it to the plugin marketplace, or updating an existing marketplace plugin.

## Source References

- Official docs: `https://docs.fba.wu-clan.cc/fastapi_best_architecture_docs/plugin/share.md`
- Backend installer behavior: `fastapi-best-architecture/backend/plugin/installer.py`
- Plugin manifest schema: `fastapi-best-architecture/.schemas/plugin.schema.json`
- Marketplace repository: `https://github.com/fastapi-practices/plugins`
- Backend plugin template: `https://github.com/fastapi-practices/fba_plugin_template`
- Frontend plugin template: `https://github.com/fastapi-practices/fba_ui_plugin_template`
- Optional release automation: `https://github.com/fastapi-practices/plugin-release`

## Naming Rules

### Backend Plugin Repository

Use the plugin folder name as the GitHub repository name.

```text
plugin name == repository name
ai == ai
```

Backend plugin names are unique across installed plugins. If a marketplace plugin with the same name already exists, choose a new plugin name before publishing.

### Frontend Plugin Repository

Use the plugin name plus `_ui` as the GitHub repository name.

```text
plugin name == repository name without _ui
ai == ai_ui
```

The `_ui` suffix separates frontend plugin repositories from backend plugin repositories. During frontend Git installation, fba removes `_ui` and installs the plugin into `apps/web-antdv-next/src/plugins/<plugin_name>`.

## Repository Layout

Create one public GitHub repository per plugin.

### Backend Repository Root

Copy all files inside the developed plugin directory into the repository root. Do not copy the outer plugin directory itself.

Correct:

```text
<repo-root>/
├── __init__.py
├── plugin.toml
├── README.md
├── api/
├── service/
└── ...
```

Incorrect:

```text
<repo-root>/
└── <plugin-name>/
    ├── __init__.py
    ├── plugin.toml
    └── README.md
```

### Frontend Repository Root

Copy all files inside `apps/web-antdv-next/src/plugins/<plugin_name>` into the repository root. Keep `_ui` only in the GitHub repository name, not in the installed plugin folder name.

```text
<repo-root>/
├── plugin.toml
├── api/
├── routes/
├── views/
├── langs/
└── ...
```

## Pre-share Checklist

### Backend Plugin

Before sharing a backend plugin repository, verify:

- Repository is public if it will be listed in the official marketplace.
- Repository name exactly matches the backend plugin folder name.
- Root contains `__init__.py`, `plugin.toml`, and `README.md`.
- `plugin.toml` passes the manifest rules in `plugin.md`.
- `README.md` follows the canonical README convention in `plugin.md`.
- `.env.example` contains only environment variables users should append to `backend/.env`.
- `requirements.txt` exists only when the plugin needs extra Python dependencies.
- If `model/` exists, at least one database under `sql/` contains all four required SQL files: `init.sql`, `destroy.sql`, `init_snowflake.sql`, `destroy_snowflake.sql`.
- `plugin.depends_on` names only real plugin folder names and has no circular dependency.
- The plugin does not depend on unstable fba internals unless the README clearly documents the required fba version.

### Frontend Plugin

Before sharing a frontend plugin repository, verify:

- Repository is public if it will be listed in the official marketplace.
- Repository name ends with `_ui`.
- Repository root contains `plugin.toml`.
- Repository root contains only the plugin contents, not an extra outer folder.
- The plugin is compatible with `apps/web-antdv-next/src/plugins`.
- Routes, API clients, views, assets, and locale files use stable plugin-relative paths.

## Publish to Marketplace

Publishing means opening a PR to the official fba plugin marketplace repository. The marketplace tracks plugins as Git submodules.

1. Fork the marketplace repository.

   ```shell
   https://github.com/fastapi-practices/plugins
   ```

2. Clone your fork.

   ```shell
   git clone https://github.com/your-username/plugins.git
   cd plugins
   ```

3. Create a feature branch.

   ```shell
   git checkout -b add-your-plugin-name
   ```

4. Add the plugin as a submodule.

   ```shell
   git submodule add https://github.com/your-username/your-plugin-name.git plugins/your-plugin-name
   git add plugins/your-plugin-name
   ```

5. Commit the submodule pointer.

   ```shell
   git commit -m "Add your-plugin-name plugin"
   ```

6. Push the branch.

   ```shell
   git push --set-upstream origin add-your-plugin-name
   ```

7. Open a PR from your fork branch to `fastapi-practices/plugins`.

8. After the PR is merged, the plugin appears in the plugin marketplace.

## Submodule Rules

- Always use HTTPS URLs for marketplace submodules.
- Do not use SSH URLs such as `git@github.com:owner/repo.git`.
- Keep the submodule path aligned with the plugin repository name.
- For backend plugins, use `plugins/<plugin-name>`.
- For frontend plugins, keep the `_ui` suffix in the repository and marketplace submodule path when publishing the frontend repository.
- Do not vendor plugin source code directly into the marketplace repository.

## Update an Existing Marketplace Plugin

To publish a new plugin version, update the plugin repository first, then update the marketplace submodule pointer.

1. Fork and clone `fastapi-practices/plugins` if needed.
2. Create an update branch.

   ```shell
   git checkout -b update-your-plugin-name
   ```

3. Update the target submodule.

   ```shell
   git submodule update --remote plugins/your-plugin-name
   git add plugins/your-plugin-name
   ```

4. Commit the updated submodule pointer.

   ```shell
   git commit -m "Update your-plugin-name plugin"
   ```

5. Push the branch and open a PR.

   ```shell
   git push --set-upstream origin update-your-plugin-name
   ```

Use `plugin-release` GitHub Action when the user asks to automate marketplace submodule updates.

## Installation Notes for Shared Plugins

Backend plugins can be installed by CLI using a ZIP path or a Git HTTP/HTTPS URL. Private repositories require token authentication in the URL, for example `https://<TOKEN>@github.com/username/private-repo.git`.

Frontend plugins are installed through Git only. The CLI asks for the frontend project root and installs into `apps/web-antdv-next/src/plugins/<plugin_name>` after removing the `_ui` suffix from the repository name.

After installing any shared plugin:

1. Follow the plugin `README.md` configuration instructions.
2. Restart the target service.
3. Verify routes, settings, dependencies, and SQL initialization in the target project.

## Agent Safety

When helping users publish or update plugins:

- Explain every git operation before running it.
- Do not stage, commit, push, or open PRs unless the user explicitly requests that action.
- Prefer preparing commands or checklists when the user asks for guidance only.
- Confirm the target repository, branch, plugin name, and marketplace path before executing release actions.
