#!/usr/bin/env python3
"""校验各层 env 的账号类字段是否一致（防止改一处忘同步）"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # 仓库根
COMPOSE_ENV = ROOT / '.env'
DEV_ENV = ROOT / 'backend/src/.env'
DEPLOY_ENV = ROOT / 'deploy/backend/docker-compose/.env.server'

# 映射：compose 层变量 -> 应用层变量（dev 与 deploy 都应一致）
MAPPINGS = {
    'POSTGRES_USER': 'DATABASE_USER',
    'POSTGRES_PASSWORD': 'DATABASE_PASSWORD',
    'RABBITMQ_USER': 'CELERY_RABBITMQ_USERNAME',
    'RABBITMQ_PASSWORD': 'CELERY_RABBITMQ_PASSWORD',
}


def load_env(path: Path) -> dict[str, str]:
    data: dict[str, str] = {}
    if not path.exists():
        return data
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, _, value = line.partition('=')
        data[key.strip()] = value.strip().strip("'\"")
    return data


def main() -> int:
    compose = load_env(COMPOSE_ENV)
    dev = load_env(DEV_ENV)
    deploy = load_env(DEPLOY_ENV)
    failed = False

    for compose_key, app_key in MAPPINGS.items():
        expected = compose.get(compose_key, '')
        for label, env in (('dev', dev), ('deploy', deploy)):
            actual = env.get(app_key, '')
            if expected != actual:
                failed = True
                print(f'[✗] {app_key} ({label}) = {actual!r} ≠ 根 .env {compose_key} = {expected!r}')
            else:
                print(f'[✓] {app_key} ({label}) 与 {compose_key} 一致')

    if failed:
        print('\n提示：请同步 backend/src/.env 与 deploy/backend/docker-compose/.env.server 中的账号，使其与根 .env 一致')
        return 1
    print('\n✓ 各层 env 账号字段一致')
    return 0


if __name__ == '__main__':
    sys.exit(main())
