from collections.abc import Generator

import pytest

from pytest import MonkeyPatch
from starlette.testclient import TestClient

from backend.main import app
from backend.src.core.config import settings
from backend.src.database.db import get_db, get_db_transaction
from backend.src.tests.utils.db import override_get_db, override_get_db_transaction

# 重载数据库
app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[get_db_transaction] = override_get_db_transaction


# Test data
PYTEST_USERNAME = 'admin'
PYTEST_PASSWORD = '123456'
PYTEST_BASE_URL = f'http://testserver{settings.FASTAPI_API_V1_PATH}'


@pytest.fixture(scope='session')
def client() -> Generator:
    with TestClient(app, base_url=PYTEST_BASE_URL) as c:
        yield c


@pytest.fixture(scope='module')
def token_headers(client: TestClient) -> dict[str, str]:
    """真实登录换凭证（``POST /auth/login``：密码校验 + 会话键落 Redis）。

    图形验证码在这里显式关掉——登录不是被测对象，留着它只会把「拿一个可用凭证」变成
    需要绕过的前置。旧实现打 ``/auth/login/swagger``（该路由已不存在）恒 404，fixture
    长期失效，所以依赖它的用例一直在 setup 阶段报错而不是真的没通过。
    """
    with MonkeyPatch.context() as patch:
        patch.setattr(settings, 'LOGIN_CAPTCHA_ENABLED', False)
        response = client.post('/auth/login', json={'username': PYTEST_USERNAME, 'password': PYTEST_PASSWORD})
    response.raise_for_status()
    access_token = response.json()['data']['access_token']
    return {'Authorization': f'Bearer {access_token}'}
