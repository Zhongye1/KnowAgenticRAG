from __future__ import annotations

from dataclasses import dataclass

import httpx


@dataclass(slots=True)
class SandboxRecord:
    sandbox_id: str
    sandbox_url: str
    status: str | None = None
    generation: str | None = None
    workdir_path: str | None = None


class ProvisionerClient:
    def __init__(
        self,
        base_url: str,
        *,
        token: str,
        timeout_seconds: int = 20,
    ):
        self._base_url = base_url.rstrip("/")
        self._timeout = httpx.Timeout(timeout_seconds)
        # create 是同步长操作，镜像拉取和 Sandbox 健康等待由 provisioner
        # 拥有；仅取消响应读取上限，连接、写入和连接池仍快速失败。
        self._create_timeout = httpx.Timeout(timeout_seconds, read=None)
        self._headers = {"Authorization": f"Bearer {token}"}

    def _request(self, method: str, path: str, *, timeout: httpx.Timeout | None = None, **kwargs) -> httpx.Response:
        return httpx.request(
            method=method,
            url=f"{self._base_url}{path}",
            timeout=timeout or self._timeout,
            headers=self._headers,
            **kwargs,
        )

    def health(self) -> bool:
        response = self._request("GET", "/health")
        return response.status_code == 200

    def create(
        self,
        sandbox_id: str,
        thread_id: str,
        uid: str,
        env: dict[str, str] | None = None,
        *,
        workdir_path: str | None = None,
        inherit_env: bool = True,
    ) -> SandboxRecord:
        response = self._request(
            "POST",
            "/api/sandboxes",
            timeout=self._create_timeout,
            json={
                "sandbox_id": sandbox_id,
                "thread_id": thread_id,
                "workdir_path": workdir_path,
                "uid": uid,
                "env": env or {},
                "inherit_env": inherit_env,
            },
        )
        if response.status_code >= 400:
            raise RuntimeError(f"failed to create sandbox {sandbox_id}: {response.status_code} {response.text}")
        return self._record_from_payload(response.json())

    def discover(self, sandbox_id: str) -> SandboxRecord | None:
        response = self._request("GET", f"/api/sandboxes/{sandbox_id}")
        if response.status_code == 404:
            return None
        if response.status_code >= 400:
            raise RuntimeError(f"failed to discover sandbox {sandbox_id}: {response.status_code} {response.text}")
        return self._record_from_payload(response.json())

    @staticmethod
    def _record_from_payload(payload: dict) -> SandboxRecord:
        """把 provisioner wire payload 转为内部 Sandbox 记录。"""
        return SandboxRecord(
            sandbox_id=payload["sandbox_id"],
            sandbox_url=payload["sandbox_url"],
            status=payload.get("status"),
            generation=payload.get("generation"),
            workdir_path=payload.get("workdir_path"),
        )

    def touch(self, sandbox_id: str) -> bool:
        response = self._request("POST", f"/api/sandboxes/{sandbox_id}/touch")
        if response.status_code == 404:
            return False
        if response.status_code >= 400:
            raise RuntimeError(f"failed to touch sandbox {sandbox_id}: {response.status_code} {response.text}")
        return True

    def delete(self, sandbox_id: str, *, expected_generation: str | None = None) -> None:
        params = {"expected_generation": expected_generation} if expected_generation else None
        response = self._request("DELETE", f"/api/sandboxes/{sandbox_id}", params=params)
        if response.status_code in {200, 404}:
            return
        raise RuntimeError(f"failed to delete sandbox {sandbox_id}: {response.status_code} {response.text}")
