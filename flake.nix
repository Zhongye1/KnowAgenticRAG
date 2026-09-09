{
  description = "Monorepo: Python src + TypeScript frontend";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          packages = [
            # 前端工具链
            pkgs.nodejs_22
            pkgs.nodePackages.pnpm

            # 后端工具链（uv 管理 Python 与虚拟环境）
            pkgs.python312
            pkgs.uv

            # 项目任务入口（Taskfile）
            pkgs.go-task

            # 常用开发工具
            pkgs.git
          ];

          shellHook = ''
            echo "🟢 DevShell OK. Node: $(node -v); Python: $(python3 --version); Task: $(task --version)"
          '';
        };
      }
    );
}
