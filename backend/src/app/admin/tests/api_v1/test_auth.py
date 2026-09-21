from starlette.testclient import TestClient


def test_logout(client: TestClient, token_headers: dict[str, str]) -> None:
    """登出后同一 token 立即失效：会话键被删，``jwt_authentication`` 的 Redis 比对随之失败。"""
    assert client.get('/auth/codes', headers=token_headers).status_code == 200

    response = client.post('/auth/logout', headers=token_headers)
    assert response.status_code == 200
    assert response.json()['code'] == 200

    assert client.get('/auth/codes', headers=token_headers).status_code == 401
