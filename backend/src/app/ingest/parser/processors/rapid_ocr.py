"""RapidOCR 进程内 OCR 引擎（ragf-design D8/M4：MinerU-HTTP 的本地兜底）。

rapidocr v3（onnxruntime）模型随 wheel 内置（PP-OCRv6 small），无需外网下载；
支持图片（png/jpg/bmp/tiff）直读，PDF 经 pypdfium2 渲染成页图后逐页 OCR。
输出按版面坐标（y 自上而下、x 自左而右）排序的 Markdown 文本行。
"""

from __future__ import annotations

import importlib.util
import io
import time

from typing import TYPE_CHECKING, Any, ClassVar

from PIL import Image

from backend.src.app.ingest.parser.base import BaseDocumentProcessor, DocumentParseError, ProcessorUnavailableError
from backend.src.app.ingest.parser.registry import register
from backend.src.common.log import log

_IMAGE_EXTENSIONS = ('.png', '.jpg', '.jpeg', '.bmp', '.tif', '.tiff')
PDF_RENDER_SCALE = 200 / 72  # ~200 DPI


if TYPE_CHECKING:
    from rapidocr import RapidOCR


class _RapidOcrEngine:
    """进程内单例 OCR 引擎（模型加载约秒级，避免每次解析重建）。"""

    _instance: RapidOCR | None = None

    @classmethod
    def get(cls) -> Any:
        if cls._instance is None:
            if importlib.util.find_spec('onnxruntime') is None:
                raise ProcessorUnavailableError(
                    'rapid_ocr 依赖 onnxruntime 未安装（pip install onnxruntime）',
                    service_name='rapid_ocr',
                    error_code='dependency_missing',
                )
            try:
                from rapidocr import RapidOCR
            except ImportError as exc:
                raise ProcessorUnavailableError(
                    f'rapidocr 未安装: {exc}', service_name='rapid_ocr', error_code='dependency_missing'
                ) from exc
            started = time.monotonic()
            try:
                cls._instance = RapidOCR()
            except Exception as exc:
                raise ProcessorUnavailableError(
                    f'RapidOCR 模型初始化失败: {exc}', service_name='rapid_ocr', error_code='engine_init_error'
                ) from exc
            log.info('RapidOCR 模型初始化完成（{:.1f}s）', time.monotonic() - started)
        return cls._instance

    @classmethod
    def reset(cls) -> None:
        cls._instance = None


def _sort_boxes(items: list[tuple[list[float], str]]) -> list[str]:
    """按检测框 (y0, x0) 排序文本行（阅读顺序，忽略置信度）。"""
    return [text for _box, text in sorted(items, key=lambda item: (item[0][1], item[0][0]))]


def _ocr_image(engine: Any, image: Image.Image) -> list[str]:
    output = engine(image)
    boxes = getattr(output, 'boxes', None)
    txts = tuple(getattr(output, 'txts', ()) or ())
    if boxes is None:
        return list(txts)
    items = []
    for box, text in zip(boxes, txts, strict=False):
        ys = [float(point[1]) for point in box]
        xs = [float(point[0]) for point in box]
        items.append(([min(xs), min(ys), max(xs), max(ys)], str(text)))
    return _sort_boxes(items)


@register
class RapidOCRProcessor(BaseDocumentProcessor):
    """RapidOCR (ONNX, PP-OCRv6) 本地 OCR。"""

    service_name: ClassVar[str] = 'rapid_ocr'
    display_name: ClassVar[str] = 'RapidOCR (ONNX)'
    supported_extensions: ClassVar[list[str]] = ['.pdf', '.png', '.jpg', '.jpeg', '.bmp', '.tif', '.tiff']

    async def parse_bytes(self, data: bytes, filename: str, params: dict[str, Any] | None = None) -> str:
        if not data:
            raise DocumentParseError('文件内容为空', service_name=self.service_name, error_code='empty_content')
        try:
            engine = _RapidOcrEngine.get()
            if filename.lower().endswith('.pdf'):
                lines = await self._parse_pdf(engine, data)
            else:
                lines = await self._parse_image(engine, data)
        except ProcessorUnavailableError:
            raise
        except DocumentParseError:
            raise
        except Exception as exc:
            raise DocumentParseError(
                f'RapidOCR 解析失败: {exc}', service_name=self.service_name, error_code='parse_error'
            ) from exc
        text = '\n'.join(lines).strip()
        if not text:
            raise DocumentParseError(
                'RapidOCR 未识别到文本', service_name=self.service_name, error_code='empty_content'
            )
        return text

    @staticmethod
    async def _parse_image(engine: Any, data: bytes) -> list[str]:
        image = Image.open(io.BytesIO(data))
        image.load()
        return _ocr_image(engine, image)

    @staticmethod
    async def _parse_pdf(engine: Any, data: bytes) -> list[str]:
        import pypdfium2 as pdfium

        document = pdfium.PdfDocument(data)
        lines: list[str] = []
        try:
            for page in document:
                bitmap = page.render(scale=PDF_RENDER_SCALE)
                image = bitmap.to_pil().convert('RGB')
                lines.extend(_ocr_image(engine, image))
        finally:
            document.close()
        return lines

    async def check_health(self) -> dict[str, Any]:
        onnx_ok = importlib.util.find_spec('onnxruntime') is not None
        try:
            from rapidocr import __version__  # type: ignore[attr-defined]
        except Exception:
            __version__ = ''
        if not onnx_ok:
            return {'status': 'unavailable', 'message': '缺少 onnxruntime 依赖', 'details': {'onnxruntime': False}}
        return {
            'status': 'healthy',
            'message': 'RapidOCR 组件可用（模型随包内置，无需外网）',
            'details': {'onnxruntime': True, 'version': str(__version__)},
        }
