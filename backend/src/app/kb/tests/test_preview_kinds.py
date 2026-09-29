"""预览类别判定纯函数测试（D55 §3A）。

重点覆盖「不信任上传的 Content-Type」这条红线：判定只看扩展名，宏启用格式一律
不进 Office 白名单。
"""

from backend.src.app.kb.utils.preview_kinds import (
    CONVERTIBLE_OFFICE_EXTENSIONS,
    MACRO_ENABLED_EXTENSIONS,
    resolve_preview_kind,
)


def test_markdown_extensions() -> None:
    assert resolve_preview_kind('readme.md') == 'markdown'
    assert resolve_preview_kind('a.MARKDOWN') == 'markdown'
    assert resolve_preview_kind('doc.mdx') == 'markdown'


def test_image_extensions() -> None:
    assert resolve_preview_kind('photo.png') == 'image'
    assert resolve_preview_kind('PHOTO.JPEG') == 'image'
    assert resolve_preview_kind('icon.svg') == 'image'


def test_pdf_extension() -> None:
    assert resolve_preview_kind('manual.pdf') == 'pdf'


def test_office_extensions_include_xlsx() -> None:
    """xlsx 必须纳入：Yuxi 只支持 docx/pptx，本项目显式补齐。"""
    assert resolve_preview_kind('report.docx') == 'office'
    assert resolve_preview_kind('sheet.xlsx') == 'office'
    assert resolve_preview_kind('deck.pptx') == 'office'


def test_macro_enabled_formats_are_unsupported() -> None:
    """宏文档宁可不可预览，也不送进转换器。"""
    for name in ('boom.docm', 'boom.xlsm', 'boom.pptm', 'boom.dotm', 'boom.xltm'):
        assert resolve_preview_kind(name) == 'unsupported', name
    # 且它们不在可转换白名单里
    assert not (MACRO_ENABLED_EXTENSIONS & CONVERTIBLE_OFFICE_EXTENSIONS)


def test_text_and_code_extensions() -> None:
    for name in ('a.txt', 'a.csv', 'a.json', 'a.yaml', 'a.py', 'a.ts', 'a.sql', 'a.log'):
        assert resolve_preview_kind(name) == 'text', name


def test_extensionless_common_files_treated_as_text() -> None:
    assert resolve_preview_kind('Dockerfile') == 'text'
    assert resolve_preview_kind('Makefile') == 'text'
    assert resolve_preview_kind('LICENSE') == 'text'


def test_unknown_and_empty_are_unsupported() -> None:
    assert resolve_preview_kind('archive.zip') == 'unsupported'
    assert resolve_preview_kind('binary.bin') == 'unsupported'
    assert resolve_preview_kind('noext') == 'unsupported'
    assert resolve_preview_kind('') == 'unsupported'


def test_case_insensitive_suffix() -> None:
    assert resolve_preview_kind('REPORT.PDF') == 'pdf'
    assert resolve_preview_kind('Sheet.XLSX') == 'office'


def test_path_in_name_uses_basename_suffix() -> None:
    """带路径的文件名取最后一段的扩展名。"""
    assert resolve_preview_kind('some/dir/report.pdf') == 'pdf'
    assert resolve_preview_kind('../etc/passwd.md') == 'markdown'
