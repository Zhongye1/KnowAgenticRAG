"""
whisper_asr.py
本地 Whisper 语音识别模块
- 支持 wav / mp3 / m4a / ogg / webm 音频文件
- 转录完成后可直接调用 RAG 流水线进行语音问答
- 依赖：openai-whisper（本地推理，无需网络）
  pip install openai-whisper ffmpeg-python
"""

from __future__ import annotations

import os
import tempfile
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import StreamingResponse, JSONResponse
import json

logger = logging.getLogger(__name__)
router = APIRouter()

# - Whisper -
_whisper_model = None
_whisper_model_size: str = os.environ.get("WHISPER_MODEL", "base")  # tiny/base/small/medium/large

SUPPORTED_AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".ogg", ".webm", ".flac", ".mp4"}


def _get_whisper_model():
    """延迟加载 Whisper 模型"""
    global _whisper_model, _whisper_model_size
    if _whisper_model is None:
        try:
            import whisper
            logger.info(f"[Whisper] 正在加载模型: {_whisper_model_size} ...")
            _whisper_model = whisper.load_model(_whisper_model_size)
            logger.info(f"[Whisper] 模型加载完成: {_whisper_model_size}")
        except ImportError:
            raise RuntimeError(
                "Whisper 未安装。请运行: pip install openai-whisper\n"
                "同时确保系统已安装 ffmpeg: https://ffmpeg.org/download.html"
            )
    return _whisper_model


# - API -

@router.post("/api/voice/transcribe")
async def transcribe_audio(
    file: UploadFile = File(..., description="音频文件（wav/mp3/m4a/ogg/webm）"),
    language: Optional[str] = Form(default="zh", description="语言代码，默认中文"),
    task: str = Form(default="transcribe", description="transcribe（转录）或 translate（翻译为英文）"),
):
    """
    语音转文字接口
    上传音频文件，返回转录文本
    """
    ext = Path(file.filename or "").suffix.lower()
    if ext not in SUPPORTED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的音频格式: {ext}。支持: {', '.join(SUPPORTED_AUDIO_EXTENSIONS)}"
        )

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        model = _get_whisper_model()
        logger.info(f"[Whisper] 开始转录: {file.filename}, language={language}, task={task}")

        result = model.transcribe(
            tmp_path,
            language=language if language != "auto" else None,
            task=task,
            fp16=False,  # CPU fp16
            verbose=False,
        )

        text = result.get("text", "").strip()
        segments = [
            {
                "start": round(seg["start"], 2),
                "end": round(seg["end"], 2),
                "text": seg["text"].strip(),
            }
            for seg in result.get("segments", [])
        ]

        logger.info(f"[Whisper] 转录完成，文本长度: {len(text)}")
        return JSONResponse({
            "success": True,
            "text": text,
            "language": result.get("language", language),
            "segments": segments,
            "duration": segments[-1]["end"] if segments else 0,
        })

    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"[Whisper] 转录失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"转录失败: {str(e)}")
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


@router.post("/api/voice/ask")
async def voice_ask(
    file: UploadFile = File(..., description="语音问题音频文件"),
    kb_id: Optional[str] = Form(default=None, description="知识库 ID（空则不使用 RAG）"),
    language: Optional[str] = Form(default="zh"),
    model: Optional[str] = Form(default=None, description="LLM 模型名，默认从配置读取"),
):
    """
    语音问答接口（语音 → 文字 → RAG 问答 → 文字回答）
    返回：转录文本 + AI 回答（SSE 流式）
    """
    ext = Path(file.filename or "").suffix.lower()
    if ext not in SUPPORTED_AUDIO_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"不支持的音频格式: {ext}")

    # 1.
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        whisper_model = _get_whisper_model()
        result = whisper_model.transcribe(tmp_path, language=language if language != "auto" else None, fp16=False)
        question = result.get("text", "").strip()
        recognized_language = result.get("language", language)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass

    if not question:
        raise HTTPException(status_code=400, detail="未能从音频中识别出文本，请检查音频质量")

    logger.info(f"[VoiceAsk] 识别问题: {question!r}, kb_id={kb_id}")

    # 2. RAG SSE
    async def generate():
        yield f"data: {json.dumps({'type': 'transcription', 'text': question, 'language': recognized_language}, ensure_ascii=False)}\n\n"

        try:
            if kb_id:
                # RAG
                from RAG_M.RAG_app import _stream_rag_answer
                async for chunk in _stream_rag_answer(question=question, kb_id=kb_id, llm_model=model):
                    yield chunk
            else:
                # LLM
                from RAG_M.RAG_app import _stream_llm_direct
                async for chunk in _stream_llm_direct(question=question, llm_model=model):
                    yield chunk
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/api/voice/models")
async def list_whisper_models():
    """列出可用的 Whisper 模型及资源需求"""
    models = [
        {"name": "tiny",   "size": "~39MB",  "vram": "~1GB",  "speed": "极快", "accuracy": "较低",  "recommended": False},
        {"name": "base",   "size": "~74MB",  "vram": "~1GB",  "speed": "快",   "accuracy": "一般",  "recommended": True,  "note": "默认，适合中文识别"},
        {"name": "small",  "size": "~244MB", "vram": "~2GB",  "speed": "中等", "accuracy": "良好",  "recommended": False},
        {"name": "medium", "size": "~769MB", "vram": "~5GB",  "speed": "慢",   "accuracy": "很好",  "recommended": False},
        {"name": "large",  "size": "~1.5GB", "vram": "~10GB", "speed": "极慢", "accuracy": "最佳",  "recommended": False},
    ]
    current = _whisper_model_size
    return {"models": models, "current": current}


@router.post("/api/voice/load-model")
async def load_whisper_model(model_size: str = Form(...)):
    """动态切换 Whisper 模型大小"""
    global _whisper_model, _whisper_model_size
    valid = {"tiny", "base", "small", "medium", "large"}
    if model_size not in valid:
        raise HTTPException(status_code=400, detail=f"无效的模型大小，可选: {valid}")

    if _whisper_model is not None:
        del _whisper_model
        _whisper_model = None

    _whisper_model_size = model_size
    try:
        _get_whisper_model()
        return {"success": True, "model": model_size, "message": f"模型 {model_size} 加载完成"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/voice/health")
async def whisper_health():
    """检查 Whisper 服务状态"""
    try:
        import whisper  # noqa
        whisper_available = True
    except ImportError:
        whisper_available = False

    # ffmpeg
    import shutil
    ffmpeg_available = shutil.which("ffmpeg") is not None

    model_loaded = _whisper_model is not None
    ready = whisper_available and ffmpeg_available

    return {
        "ready": ready,
        "whisper_installed": whisper_available,
        "ffmpeg_installed": ffmpeg_available,
        "model_loaded": model_loaded,
        "current_model": _whisper_model_size,
        "install_hint": (
            None if ready else
            "请运行: pip install openai-whisper && 安装 ffmpeg (https://ffmpeg.org)"
        )
    }
