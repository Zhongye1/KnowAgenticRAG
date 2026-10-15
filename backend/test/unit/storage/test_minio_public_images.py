import json

import pytest

from ars.storage.minio.client import MinIOClient, normalize_public_minio_url


class FakeMinio:
    def __init__(self):
        self.policy = None

    def bucket_exists(self, bucket_name: str) -> bool:
        return False

    def make_bucket(self, bucket_name: str) -> None:
        return None

    def set_bucket_policy(self, bucket_name: str, policy: str) -> None:
        self.policy = json.loads(policy)

    def put_object(self, **kwargs):
        return object()


def test_public_image_uses_same_origin_url_without_bucket_listing(monkeypatch):
    monkeypatch.setenv("MINIO_PUBLIC_URL", "/minio")
    client = MinIOClient()
    fake_minio = FakeMinio()
    client._client = fake_minio

    result = client.upload_file("public", "images/user 1/avatar.png", b"image", "image/png")

    assert result.url == "/minio/public/images/user%201/avatar.png"
    assert fake_minio.policy is not None
    actions = [action for statement in fake_minio.policy["Statement"] for action in statement["Action"]]
    assert actions == ["s3:GetObject"]


def test_legacy_public_minio_url_is_normalized_to_same_origin(monkeypatch):
    monkeypatch.setenv("MINIO_PUBLIC_URL", "/minio")

    assert (
        normalize_public_minio_url("http://example.test:9000/public/avatar/user.png") == "/minio/public/avatar/user.png"
    )
    assert normalize_public_minio_url("https://cdn.example.test/public/user.png") == (
        "https://cdn.example.test/public/user.png"
    )


def test_legacy_public_minio_url_preserves_query_and_fragment(monkeypatch):
    monkeypatch.setenv("MINIO_PUBLIC_URL", "/minio")

    assert (
        normalize_public_minio_url("http://example.test:9000/public/avatar/user.png?v=123#preview")
        == "/minio/public/avatar/user.png?v=123#preview"
    )


@pytest.mark.parametrize("read_error", [False, True])
def test_download_file_always_releases_response(read_error):
    class Response:
        closed = False
        released = False

        def read(self):
            if read_error:
                raise RuntimeError("read failed")
            return b"content"

        def close(self):
            self.closed = True

        def release_conn(self):
            self.released = True

    response = Response()
    client = MinIOClient()
    client._client = type("FakeClient", (), {"get_object": lambda _self, **_kwargs: response})()

    if read_error:
        with pytest.raises(RuntimeError, match="read failed"):
            client.download_file("bucket", "object")
    else:
        assert client.download_file("bucket", "object") == b"content"

    assert response.closed is True
    assert response.released is True


@pytest.mark.asyncio
@pytest.mark.parametrize("read_error", [False, True])
async def test_async_download_file_always_releases_response(read_error):
    class Response:
        closed = False
        released = False

        def read(self):
            if read_error:
                raise RuntimeError("read failed")
            return b"content"

        def close(self):
            self.closed = True

        def release_conn(self):
            self.released = True

    response = Response()
    client = MinIOClient()
    client._client = type("FakeClient", (), {"get_object": lambda _self, **_kwargs: response})()

    if read_error:
        with pytest.raises(RuntimeError, match="read failed"):
            await client.adownload_file("bucket", "object")
    else:
        assert await client.adownload_file("bucket", "object") == b"content"

    assert response.closed is True
    assert response.released is True
