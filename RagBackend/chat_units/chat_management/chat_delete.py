import json
import logging
import os
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter()

CHAT_DOCUMENT_DIR = "chat_units/chat_documents"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class DeleteSessionRequest(BaseModel):
    sessionId: str


@router.delete("/delete-session")  # DELETE
async def delete_session(request: DeleteSessionRequest):
    """删除指定的对话会话"""
    try:
        session_id = request.sessionId

        if not session_id:
            raise HTTPException(status_code=400, detail="缺少会话ID")

        chat_dir = Path(CHAT_DOCUMENT_DIR)

        if not chat_dir.exists():
            logger.warning(f"对话目录不存在: {chat_dir}")
            raise HTTPException(status_code=404, detail="对话目录不存在")

        session_found = False

        for file_path in chat_dir.glob("*.json"):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)

                chat_sessions = data.get("chat_sessions", {})
                if session_id in chat_sessions:
                    del chat_sessions[session_id]
                    session_found = True

                    if not chat_sessions:
                        os.remove(file_path)
                        logger.info(f"文件已删除: {file_path.name}")
                    else:
                        with open(file_path, "w", encoding="utf-8") as f:
                            json.dump(data, f, ensure_ascii=False, indent=2)
                        logger.info(f"会话已从文件中删除: {file_path.name}")

                    break

            except json.JSONDecodeError as e:
                logger.error(f"JSON解析失败 {file_path}: {str(e)}")
            except Exception as e:
                logger.error(f"处理文件失败 {file_path}: {str(e)}")

        if not session_found:
            raise HTTPException(status_code=404, detail=f"会话 {session_id} 未找到")

        # Response format
        return JSONResponse(
            content={"status": "success", "message": f"会话 {session_id} 已成功删除"}
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除会话失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"删除会话失败: {str(e)}")


@router.post("/delete-chat-document")
async def delete_chat_document_legacy(request: dict):
    """旧版删除接口，保持向后兼容"""
    session_id = request.get("sessionId")
    if not session_id:
        raise HTTPException(status_code=400, detail="缺少会话ID")

    new_request = DeleteSessionRequest(sessionId=session_id)
    return await delete_session(new_request)
