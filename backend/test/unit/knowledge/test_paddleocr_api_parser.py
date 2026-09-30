from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest

import ars.knowledge.parser.paddleocr_api as paddleocr_api
from ars.knowledge.parser.base import DocumentParserException
from ars.knowledge.parser.paddleocr_api import PaddleOCRPPOCRv6Parser, PaddleOCRVLParser


@dataclass
class FakeResponse:
    status_code: int
    json_body: dict[str, Any] | None = None
    text: str = ""
    content: bytes = b""
    headers: dict[str, str] | None = None

    def json(self) -> dict[str, Any]:
        assert self.json_body is not None
        return self.json_body


def _build_file(tmp_path: Path, suffix: str = ".png") -> Path:
    file_path = tmp_path / f"sample{suffix}"
    file_path.write_bytes(b"fake image")
    return file_path


def test_paddleocr_vl_submits_model_specific_payload(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    file_path = _build_file(tmp_path)
    submitted: dict[str, Any] = {}

    def fake_post(url, headers=None, data=None, files=None, json=None, timeout=None):  # noqa: A002
        submitted["url"] = url
        submitted["data"] = data
        submitted["json"] = json
        submitted["files"] = files
        return FakeResponse(200, {"code": 0, "data": {"jobId": "job-vl"}})

    def fake_get(url, headers=None, timeout=None):
        if url.endswith("/job-vl"):
            return FakeResponse(200, {"data": {"state": "done", "resultUrl": {"jsonUrl": "https://result.test/vl"}}})
        row = {
            "result": {
                "layoutParsingResults": [
                    {"markdown": {"text": "VL markdown", "images": {}}, "outputImages": {"debug": "ignored"}}
                ]
            }
        }
        return FakeResponse(200, text=json.dumps(row))

    monkeypatch.setattr(paddleocr_api.requests, "post", fake_post)
    monkeypatch.setattr(paddleocr_api.requests, "get", fake_get)

    parser = PaddleOCRVLParser(api_token="token")
    result = parser.process_file(
        str(file_path),
        params={
            "optional_payload": {
                "useChartRecognition": True,
                "useTextlineOrientation": True,
                "ignored": True,
            }
        },
    )

    assert result == "VL markdown"
    assert submitted["data"]["model"] == "PaddleOCR-VL-1.6"
    optional_payload = json.loads(submitted["data"]["optionalPayload"])
    assert optional_payload == {
        "useDocOrientationClassify": False,
        "useDocUnwarping": False,
        "useChartRecognition": True,
    }


def test_paddleocr_pp_ocrv6_submits_model_specific_payload(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    file_path = _build_file(tmp_path)
    submitted: dict[str, Any] = {}

    def fake_post(url, headers=None, data=None, files=None, json=None, timeout=None):  # noqa: A002
        submitted["data"] = data
        return FakeResponse(200, {"data": {"jobId": "job-ocr"}})

    def fake_get(url, headers=None, timeout=None):
        if url.endswith("/job-ocr"):
            return FakeResponse(200, {"data": {"state": "done", "resultUrl": {"jsonUrl": "https://result.test/ocr"}}})
        row = {
            "result": {
                "ocrResults": [
                    {"prunedResult": {"rec_texts": ["PaddleOCR API Test", "", "Invoice total: 123.45"]}}
                ]
            }
        }
        return FakeResponse(200, text=json.dumps(row))

    monkeypatch.setattr(paddleocr_api.requests, "post", fake_post)
    monkeypatch.setattr(paddleocr_api.requests, "get", fake_get)

    parser = PaddleOCRPPOCRv6Parser(api_token="token")
    result = parser.process_file(
        str(file_path),
        params={
            "optional_payload": {
                "useTextlineOrientation": True,
                "useChartRecognition": True,
                "ignored": True,
            }
        },
    )

    assert result == "PaddleOCR API Test\nInvoice total: 123.45"
    assert submitted["data"]["model"] == "PP-OCRv6"
    optional_payload = json.loads(submitted["data"]["optionalPayload"])
    assert optional_payload == {
        "useDocOrientationClassify": False,
        "useDocUnwarping": False,
        "useTextlineOrientation": True,
    }


def test_paddleocr_url_input_uses_json_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    submitted: dict[str, Any] = {}

    def fake_post(url, headers=None, data=None, files=None, json=None, timeout=None):  # noqa: A002
        submitted["headers"] = headers
        submitted["data"] = data
        submitted["files"] = files
        submitted["json"] = json
        return FakeResponse(200, {"data": {"jobId": "job-url"}})

    def fake_get(url, headers=None, timeout=None):
        if url.endswith("/job-url"):
            return FakeResponse(200, {"data": {"state": "done", "resultUrl": {"jsonUrl": "https://result.test/url"}}})
        row = {"result": {"ocrResults": [{"prunedResult": {"rec_texts": ["url text"]}}]}}
        return FakeResponse(200, text=json.dumps(row))

    monkeypatch.setattr(paddleocr_api.requests, "post", fake_post)
    monkeypatch.setattr(paddleocr_api.requests, "get", fake_get)

    parser = PaddleOCRPPOCRv6Parser(api_token="token")
    result = parser.process_file("https://example.test/file.png?signature=abc")

    assert result == "url text"
    assert submitted["headers"]["Content-Type"] == "application/json"
    assert submitted["data"] is None
    assert submitted["files"] is None
    assert submitted["json"]["fileUrl"] == "https://example.test/file.png?signature=abc"
    assert submitted["json"]["model"] == "PP-OCRv6"


def test_paddleocr_poll_handles_pending_running_and_done(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    file_path = _build_file(tmp_path)
    states = iter(["pending", "running", "done"])
    sleep_calls: list[float] = []

    monkeypatch.setattr(
        paddleocr_api.requests,
        "post",
        lambda *args, **kwargs: FakeResponse(200, {"data": {"jobId": "job-poll"}}),
    )

    def fake_get(url, headers=None, timeout=None):
        if url.endswith("/job-poll"):
            state = next(states)
            data: dict[str, Any] = {"state": state}
            if state == "done":
                data["resultUrl"] = {"jsonUrl": "https://result.test/poll"}
            return FakeResponse(200, {"data": data})
        row = {"result": {"ocrResults": [{"prunedResult": {"rec_texts": ["done text"]}}]}}
        return FakeResponse(200, text=json.dumps(row))

    monkeypatch.setattr(paddleocr_api.requests, "get", fake_get)
    monkeypatch.setattr(paddleocr_api.time, "sleep", lambda seconds: sleep_calls.append(seconds))

    parser = PaddleOCRPPOCRv6Parser(api_token="token")
    result = parser.process_file(str(file_path), params={"poll_interval_seconds": 0.25})

    assert result == "done text"
    assert sleep_calls == [0.25, 0.25]


def test_paddleocr_failed_job_raises_parser_exception(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    file_path = _build_file(tmp_path)

    monkeypatch.setattr(
        paddleocr_api.requests,
        "post",
        lambda *args, **kwargs: FakeResponse(200, {"data": {"jobId": "job-failed"}}),
    )
    monkeypatch.setattr(
        paddleocr_api.requests,
        "get",
        lambda *args, **kwargs: FakeResponse(
            200,
            {"data": {"state": "failed", "errorMsg": "quota exceeded"}},
        ),
    )

    parser = PaddleOCRVLParser(api_token="token")
    with pytest.raises(DocumentParserException, match="quota exceeded"):
        parser.process_file(str(file_path))


def test_paddleocr_missing_token_health_and_parse_error(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    file_path = _build_file(tmp_path)
    monkeypatch.delenv("PADDLEOCR_API_TOKEN", raising=False)
    parser = PaddleOCRVLParser()

    health = parser.check_health()

    assert health["status"] == "unavailable"
    assert "PADDLEOCR_API_TOKEN" in health["message"]
    with pytest.raises(DocumentParserException, match="PADDLEOCR_API_TOKEN"):
        parser.process_file(str(file_path))


def test_paddleocr_configured_token_health_does_not_submit_job() -> None:
    parser = PaddleOCRVLParser(api_token="token")

    health = parser.check_health()

    assert health["status"] == "configured"
    assert "解析时验证" in health["message"]
    assert health["details"]["model"] == "PaddleOCR-VL-1.6"


def test_paddleocr_vl_uploads_markdown_images(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    file_path = _build_file(tmp_path)
    uploaded: dict[str, Any] = {}

    monkeypatch.setattr(
        paddleocr_api.requests,
        "post",
        lambda *args, **kwargs: FakeResponse(200, {"data": {"jobId": "job-images"}}),
    )

    def fake_get(url, headers=None, timeout=None):
        if url.endswith("/job-images"):
            return FakeResponse(
                200,
                {"data": {"state": "done", "resultUrl": {"jsonUrl": "https://result.test/images"}}},
            )
        if url == "https://image.test/table.png":
            return FakeResponse(200, content=b"image-bytes", headers={"Content-Type": "image/png"})
        row = {
            "result": {
                "layoutParsingResults": [
                    {
                        "markdown": {
                            "text": "before ![](images/table.png) after",
                            "images": {"images/table.png": "https://image.test/table.png"},
                        }
                    }
                ]
            }
        }
        return FakeResponse(200, text=json.dumps(row))

    class FakeMinioClient:
        def ensure_bucket_exists(self, bucket_name):
            uploaded["bucket_name"] = bucket_name

        def upload_file(self, bucket_name, object_name, data):
            uploaded["object_name"] = object_name
            uploaded["data"] = data
            return type("UploadResult", (), {"url": "minio://public/kb/table.png"})()

    monkeypatch.setattr(paddleocr_api.requests, "get", fake_get)
    monkeypatch.setattr(paddleocr_api, "get_minio_client", lambda: FakeMinioClient())
    monkeypatch.setattr(paddleocr_api.time, "time", lambda: 1.0)

    parser = PaddleOCRVLParser(api_token="token")
    result = parser.process_file(
        str(file_path),
        params={"image_bucket": "kb-images", "image_prefix": "kb/kb-images"},
    )

    assert result == "before ![](/api/knowledge/databases/kb/images/kb-images/1000000_table.png) after"
    assert uploaded == {
        "bucket_name": "kb-images",
        "object_name": "kb/kb-images/1000000_table.png",
        "data": b"image-bytes",
    }
