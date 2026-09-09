"""文档对象存储纯函数测试。"""

from backend.src.app.kb.service.document_storage import kb_object_key


def test_kb_object_key_contains_tenant_prefix() -> None:
    key = kb_object_key('core', 'mydocs', 'abc123', 'report.pdf')
    assert key == 'kb/core/mydocs/abc123/report.pdf'


def test_kb_object_key_strips_path_from_filename() -> None:
    key = kb_object_key('core', 'mydocs', 'abc123', '../../etc/passwd.pdf')
    assert key == 'kb/core/mydocs/abc123/passwd.pdf'


def test_kb_object_key_empty_filename_fallback() -> None:
    key = kb_object_key('core', 'mydocs', 'abc123', '')
    assert key == 'kb/core/mydocs/abc123/file'
