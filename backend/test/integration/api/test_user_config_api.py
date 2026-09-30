from __future__ import annotations

import pytest

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]

USER_CONFIG_PATH = "/api/user/config"


async def test_user_config_requires_auth(test_client):
    response = await test_client.get(USER_CONFIG_PATH)
    assert response.status_code == 401


async def test_user_config_round_trip(test_client, standard_user):
    headers = standard_user["headers"]

    initial_response = await test_client.get(USER_CONFIG_PATH, headers=headers)
    assert initial_response.status_code == 200, initial_response.text
    initial_payload = initial_response.json()
    assert initial_payload["enable_memory"] is False

    save_response = await test_client.put(USER_CONFIG_PATH, json={"enable_memory": True}, headers=headers)
    assert save_response.status_code == 200, save_response.text
    assert save_response.json()["enable_memory"] is True

    final_response = await test_client.get(USER_CONFIG_PATH, headers=headers)
    assert final_response.status_code == 200, final_response.text
    assert final_response.json()["enable_memory"] is True
