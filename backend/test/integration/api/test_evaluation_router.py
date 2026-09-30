"""
Integration tests for evaluation router endpoints.
"""

from __future__ import annotations

import uuid

import pytest

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def _upload_test_dataset(test_client, admin_headers: dict[str, str], kb_id: str) -> tuple[str, str]:
    dataset_name = f"pytest_dataset_{uuid.uuid4().hex[:8]}"
    line = '{"query":"什么是单元测试？","gold_answer":"用于验证代码行为的自动化测试"}\n'

    response = await test_client.post(
        f"/api/evaluation/databases/{kb_id}/datasets/upload",
        data={"name": dataset_name, "description": "pytest dataset for download"},
        files={"file": ("pytest_dataset.jsonl", line.encode("utf-8"), "application/x-ndjson")},
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text

    payload = response.json()
    assert payload.get("message") == "success"
    dataset_id = payload.get("data", {}).get("dataset_id")
    assert dataset_id
    return dataset_id, line


async def test_download_dataset_requires_admin(test_client, standard_user):
    response = await test_client.get(
        "/api/evaluation/datasets/dataset_fake/download",
        headers=standard_user["headers"],
    )
    assert response.status_code == 403


async def test_admin_can_download_dataset(test_client, admin_headers, knowledge_database):
    dataset_id, expected_line = await _upload_test_dataset(test_client, admin_headers, knowledge_database["kb_id"])

    response = await test_client.get(
        f"/api/evaluation/datasets/{dataset_id}/download",
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text
    assert "application/x-ndjson" in response.headers.get("content-type", "")
    assert "attachment" in response.headers.get("content-disposition", "").lower()

    content = response.content.decode("utf-8")
    assert expected_line.strip() in content


async def test_download_dataset_not_found(test_client, admin_headers):
    response = await test_client.get(
        f"/api/evaluation/datasets/dataset_not_found_{uuid.uuid4().hex[:8]}/download",
        headers=admin_headers,
    )
    assert response.status_code == 404, response.text
