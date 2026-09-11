"""PixelRAG 渲染切片引擎（双管线摄取 spec D7，EagleRAG pixelrag_adapter 迁移）。

PixelRAG 被收敛为「渲染 + 切片」库调用：``pixelrag_render`` 将 PDF/图片/网页
渲染为条带 tile（``{outdir}/{stem}.png.tiles/``：tiles.json 清单 + JPEG 条带），
视觉编码交给 :mod:`model_provider.providers.visual`。不启动 pixelrag serve、不建 FAISS。

失败 fail-closed：库缺包或渲染零 tile 抛 ``PixelRagEngineError``。
"""

from __future__ import annotations

import json
import tempfile

from pathlib import Path
from typing import Any

from backend.src.common.log import log

__all__ = ['PixelRagEngineError', 'Tile', 'render_to_tiles']


class PixelRagEngineError(Exception):
    """PixelRAG 渲染引擎失败（fail-closed）。"""


# tile 形态：{'image_bytes', 'page', 'position', 'width', 'height'}
Tile = dict[str, Any]


def _read_tiles_from_paths(paths: list[Path]) -> list[Tile]:
    """归一化 pixelrag_render 返回的路径列表 → tile 字典（清单优先，兜底扫图）。"""
    image_exts = {'.jpg', '.jpeg', '.png', '.webp'}
    out: list[Tile] = []

    def make(fp: Path, *, page: int, position: str) -> None:
        data = fp.read_bytes()
        out.append({'image_bytes': data, 'page': page, 'position': position})

    for raw in paths:
        p = Path(raw)
        if p.is_dir():
            tiles_json = p / 'tiles.json'
            if tiles_json.exists():
                meta = json.loads(tiles_json.read_text())
                names = meta.get('tiles', []) or []
                # PDF 清单为 list[str]；CDP 可能产出 list[dict]，两种都接受
                for idx, name in enumerate(names):
                    fname = name['file'] if isinstance(name, dict) else name
                    fp = p / fname
                    if fp.exists():
                        make(fp, page=idx, position=f'strip_{idx}')
                continue
            img_files = sorted(f for f in p.iterdir() if f.suffix.lower() in image_exts)
            for idx, fp in enumerate(img_files):
                make(fp, page=idx, position=f'strip_{idx}')
        elif p.is_file():
            make(p, page=0, position='strip_0')
    return out


def render_to_tiles(source: str) -> list[Tile]:
    """渲染 + 切片，返回 tile 字典列表（阻塞调用，任务层以 to_thread 执行）。

    Args:
        source: 本地文件路径（图片/PDF）。
    """
    try:
        import pixelrag_render  # type: ignore[reportMissingImports]  # 可选依赖
    except ImportError as exc:
        raise PixelRagEngineError('pixelrag 未安装（可选依赖，安装方式见双管线摄取 spec D1）') from exc

    from backend.src.core.config import settings

    outdir = tempfile.mkdtemp(prefix='ragf_render_')
    try:
        lower = source.lower()
        if lower.endswith('.pdf'):
            paths = pixelrag_render.render_pdf(
                source, outdir, dpi=settings.RAGF_PIXELRAG_PDF_DPI, quality=settings.RAGF_PIXELRAG_QUALITY
            )
        else:
            paths = pixelrag_render.render_file(source, outdir)
        tiles = _read_tiles_from_paths(list(paths))
    except PixelRagEngineError:
        raise
    except Exception as exc:
        raise PixelRagEngineError(f'pixelrag_render 渲染失败 (source={source}): {exc}') from exc
    finally:
        _cleanup(outdir)

    if not tiles:
        raise PixelRagEngineError(f'pixelrag_render 未产出任何 tile (source={source})')
    log.info('PixelRAG 渲染切片完成 source={} tiles={}', Path(source).name, len(tiles))
    return tiles


def _cleanup(outdir: str) -> None:
    """渲染临时目录清理（尽力而为）。"""
    import shutil

    shutil.rmtree(outdir, ignore_errors=True)
