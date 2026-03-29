# monorepo工程治理

针对您的 monorepo 项目，如何在根目录配置 husky，实现提交时只运行对应部分的 lint 检查，这是一个非常实用且常见的需求。这可以避免“牵一发而动全身”的问题，比如修改一个前端文件却要等待整个后端代码的检查。

核心思路是：**在根目录设置一个统一的 `pre-commit` 钩子，该钩子通过分析 `git diff` 的结果，判断哪些文件被修改了，然后根据文件路径决定执行哪个子项目的 lint 命令**。

以下是详细的实现步骤：

### 第一步：在根目录初始化 Husky

由于您希望由根目录统一管理，我们需要确保 husky 是在项目根目录安装和初始化的。

1. **进入项目根目录并初始化 npm (如果还没有 package.json)**

    ```
    bashcd e:\TESTrange7\KnowledgeRAG-GZHU
    # 如果根目录没有package.json，则创建一个
    npm init -y
    ```

2. **安装 husky 和 lint-staged 到开发依赖**

    ```
    bash

    npm install -D husky lint-staged
    ```

3. **初始化 husky** 这会在根目录创建 `.husky` 目录，并将 Git hooks 指向该目录。

    ```
    bash

    npx husky-init && npm install
    ```

    执行后，您会看到根目录下多出了一个 `.husky` 文件夹。

### 第二步：配置 Lint-Staged 实现条件化检查

[[lint-staged](javascript:void(0))](https://github.com/lint-staged) 是解决此问题的关键工具。它允许我们为不同模式（pattern）的文件指定不同的命令。

1. **在根目录的 [package.json](<javascript:void(0)>) 中添加 [lint-staged](<javascript:void(0)>) 配置**

    根据您项目的结构：
    - **前端 (Frontend)**: 位于 `RagFrontend/` 目录，其 lint 脚本是 `npm run lint`。
    - **后端 (Backend)**: 位于 `RagBackend/` 目录，目前未发现明确的 lint 工具（如 flake8, pylint, ruff）。但为了完整性，我们可以先假设使用 [ruff](https://beta.ruff.rs/docs/)（现代、快速的 Python linter），如果没有则跳过或后续添加。

    在 [e:\TESTrange7\KnowledgeRAG-GZHU\package.json](<javascript:void(0)>) 中添加以下内容：

    ```
    json{
      "scripts": {
        // ... 其他脚本
      },
      "lint-staged": {
        "RagFrontend/**/*.{js,ts,vue,jsx,tsx}": [
          "cd RagFrontend && npm run lint"
        ],
        "RagBackend/**/*.py": [
          "cd RagBackend && python -m ruff check ."
        ]
      }
    }
    ```

    **解释**:
    - `"RagFrontend/**/*.{js,ts,vue,jsx,tsx}"`: 这个 glob 模式匹配所有在 `RagFrontend` 目录下的 JavaScript、TypeScript 和 Vue 文件。
    - `"cd RagFrontend && npm run lint"`: 当有上述文件被修改时，自动进入 `RagFrontend` 目录并执行其预设的 lint 命令。
    - `"RagBackend/**/*.py"`: 匹配 `RagBackend` 目录下的所有 Python 文件。
    - `"cd RagBackend && python -m ruff check ."`: 进入 `RagBackend` 目录并运行 ruff 检查。如果您不使用 ruff，请替换为 `flake8` 或 `pylint` 等命令。

2. **重要提示**: 经检查，`RagBackend` 的 [pyproject.toml](<javascript:void(0)>) 和 [requirements.txt](<javascript:void(0)>) 中均未包含任何 lint 工具。这意味着目前无法对后端进行自动化 lint 检查。您可以选择：
    - 方案A (推荐)

        : 为后端添加 lint 工具。例如，在

        ```
        RagBackend/pyproject.toml
        ```

        中添加：

        ```
        toml[tool.ruff]
        select = ["E", "W", "F"] # 示例规则
        ```

        并在

        requirements.txt

        中添加

        ```
        ruff
        ```

        。

    - **方案B**: 暂时不为后端配置，只保留前端的检查。

### 第三步：创建根级 Pre-Commit 钩子

现在，我们需要让 husky 的 `pre-commit` 钩子去触发 [lint-staged](<javascript:void(0)>)。

1. **创建 `.husky/pre-commit` 文件**

    使用 `npx husky add` 命令来创建这个文件：

    ```
    bash

    npx husky add .husky/pre-commit "npx lint-staged"
    ```

    这条命令会生成一个名为 `pre-commit` 的可执行脚本，其内容就是运行 `npx lint-staged`。

### 最终效果与工作流程

完成以上配置后，当您执行 `git commit` 时，会发生以下事情：

1. Git 触发 `pre-commit` 钩子。

2. 钩子执行 `npx lint-staged`。

3. [lint-staged](<javascript:void(0)>) 分析当前暂存区（staged）中所有被修改的文件。

4. [lint-staged](<javascript:void(0)>) 将这些文件按我们在 [package.json](<javascript:void(0)>) 中定义的模式进行分组。

5. 智能执行

    :
    - 如果您只修改了 `RagFrontend/src/components/Button.vue`，那么 **只会** 执行 `cd RagFrontend && npm run lint`。
    - 如果您只修改了 `RagBackend/main.py`，那么 **只会** 执行 `cd RagBackend && python -m ruff check .`。
    - 如果您同时修改了前端和后端的文件，那么两个 lint 命令都会被执行。

6. 如果任何一个 lint 命令失败（返回非零状态码），commit 将被中止，直到您修复问题为止。

这样，您就实现了“**谁改动，谁检查**”的高效、精准的提交前检查机制，完美解决了 monorepo 中跨语言、跨项目的 lint 冲突问题。
