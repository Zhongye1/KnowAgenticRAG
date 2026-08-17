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

            # 后端工具链
            pkgs.python312
            pkgs.uv
            pkgs.python312Packages.pip
            pkgs.python312Packages.virtualenv

            # 常用开发工具
            pkgs.git
            pkgs.just
            pkgs.watchexec
          ];

          shellHook = ''
            echo "🟢 DevShell OK. Node: $(node -v); Python: $(python3 --version)"
          '';
        };
      }
    );
}