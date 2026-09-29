"""文档预览转换服务（D55 §3E）。

只做一件事：**字节进 → PDF 出**。不持有任何 MinIO/DB 凭据，不知道知识库存在，
因此即使被攻破也拿不到平台数据。

工程上三个关键点：

1. **每次转换独立的 LibreOffice profile**（`-env:UserInstallation=file:///tmp/lo/<uuid>`）：
   soffice 并发共用同一 profile 会互相锁死，这是最常见的翻车点。
2. **有界并发 + 快速失败**：soffice 是重进程，超过池容量直接 503，不无限排队
   （后端会把它落成 failed 并走降级梯，比堆积到超时更好）。
3. **硬超时**：单次转换超过 `CONVERT_TIMEOUT_SECONDS` 立即杀进程组。

对外契约（与 `kb/service/preview_converter.py` 对齐）：
- 请求：`POST /convert`，体为原始字节，头 `X-Filename` 带净化后的文件名；
- 响应：PDF 字节，头 `X-Page-Count` 带页数（避免后端为读页数再引 PDF 解析库）。
"""

from __future__ import annotations

import asyncio
import os
import shutil
import signal
import subprocess
import tempfile

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Request, Response

# 可转换扩展名白名单：与 backend `kb/utils/preview_kinds.py` 的
# CONVERTIBLE_OFFICE_EXTENSIONS 保持一致（宏格式不在其列，两侧都不放行）
ALLOWED_EXTENSIONS = {'.docx', '.xlsx', '.pptx', '.odt', '.ods', '.odp'}

MAX_INPUT_BYTES = int(os.getenv('CONVERT_MAX_INPUT_BYTES', str(100 * 1024 * 1024)))
CONVERT_TIMEOUT_SECONDS = float(os.getenv('CONVERT_TIMEOUT_SECONDS', '90'))
MAX_CONCURRENCY = int(os.getenv('CONVERT_MAX_CONCURRENCY', '2'))

# 在飞转换数：asyncio 单线程下「检查 + 自增」之间没有 await，天然原子，
# 比读 Semaphore 私有属性判饱和干净。
_active_conversions = 0


class ConversionError(RuntimeError):
    """转换失败（超时 / soffice 非零退出 / 产物缺失）。"""


def _sanitize_stem(filename: str) -> tuple[str, str]:
    """返回 (净化后的主干名, 小写扩展名)。扩展名不在白名单则抛 ValueError。"""
    name = Path(filename or 'file').name
    suffix = Path(name).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise ValueError(f'不支持的扩展名: {suffix or "(无)"}')
    stem = Path(name).stem or 'file'
    stem = ''.join(ch for ch in stem if ch.isalnum() or ch in '-_')[:80] or 'file'
    return stem, suffix


def _count_pages(pdf_path: Path) -> int:
    """用 qpdf 的 JSON 输出数页数，避免为此引入 PDF 解析库。"""
    try:
        proc = subprocess.run(  # noqa: S603 - 固定可执行文件与参数
            ['qpdf', '--show-npages', str(pdf_path)],
            capture_output=True,
            timeout=30,
            check=False,
        )
        return int(proc.stdout.decode().strip() or 0)
    except Exception:
        return 0


def _convert_sync(data: bytes, filename: str) -> tuple[bytes, int]:
    """同步转换（在线程池中执行）：写临时文件 → soffice → qpdf 线性化 → 读回。"""
    stem, suffix = _sanitize_stem(filename)
    workdir = Path(tempfile.mkdtemp(prefix='conv-', dir='/tmp'))
    try:
        source = workdir / f'{stem}{suffix}'
        source.write_bytes(data)
        profile = workdir / 'lo-profile'
        outdir = workdir / 'out'
        outdir.mkdir()
        cmd = [
            'soffice',
            '--headless',
            '--norestore',
            '--nolockcheck',
            '--nodefault',
            '--nologo',
            f'-env:UserInstallation=file://{profile}',
            '--convert-to',
            'pdf:writer_pdf_Export',
            '--outdir',
            str(outdir),
            str(source),
        ]
        # start_new_session=True：超时时按进程组杀，避免 soffice 子进程残留
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
        try:
            _stdout, stderr = proc.communicate(timeout=CONVERT_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired as exc:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
            proc.communicate()
            raise ConversionError(f'转换超时（{CONVERT_TIMEOUT_SECONDS:.0f}s）') from exc
        if proc.returncode != 0:
            raise ConversionError(f'soffice 退出码 {proc.returncode}: {stderr.decode()[:300]}')
        produced = sorted(outdir.glob('*.pdf'))
        if not produced:
            raise ConversionError('soffice 未产出 PDF')
        linearized = workdir / 'linearized.pdf'
        # 线性化失败（qpdf 非零）不致命：退回未线性化产物，PDF.js 仍可读
        qpdf = subprocess.run(  # noqa: S603 - 固定可执行文件与参数
            ['qpdf', '--linearize', str(produced[0]), str(linearized)],
            capture_output=True,
            timeout=60,
            check=False,
        )
        final = linearized if qpdf.returncode == 0 and linearized.exists() else produced[0]
        return final.read_bytes(), _count_pages(final)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Path('/tmp').mkdir(parents=True, exist_ok=True)
    yield


@asynccontextmanager
async def _conversion_slot():
    """占用一个转换槽；池满直接 503 快速失败（后端会落 failed 走降级梯）。"""
    global _active_conversions
    if _active_conversions >= MAX_CONCURRENCY:
        raise HTTPException(status_code=503, detail='转换池已满，请稍后重试')
    _active_conversions += 1
    try:
        yield
    finally:
        _active_conversions -= 1


app = FastAPI(title='RAGF Preview Converter', version='1.0.0', lifespan=lifespan)


@app.get('/health')
async def health() -> dict[str, object]:
    """健康检查：同时暴露池容量，便于判断是否长期饱和。"""
    return {
        'status': 'ok',
        'max_concurrency': MAX_CONCURRENCY,
        'active_conversions': _active_conversions,
        'timeout_seconds': CONVERT_TIMEOUT_SECONDS,
    }


@app.post('/convert')
async def convert(
    request: Request,
    x_filename: str = Header(default='file.docx', alias='X-Filename'),
) -> Response:
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail='空请求体')
    if len(data) > MAX_INPUT_BYTES:
        raise HTTPException(status_code=413, detail=f'输入超过 {MAX_INPUT_BYTES} 字节上限')
    async with _conversion_slot():
        try:
            pdf_bytes, page_count = await asyncio.to_thread(_convert_sync, data, x_filename)
        except ValueError as exc:
            raise HTTPException(status_code=415, detail=str(exc)) from exc
        except ConversionError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    return Response(
        content=pdf_bytes,
        media_type='application/pdf',
        headers={'X-Page-Count': str(page_count)},
    )
