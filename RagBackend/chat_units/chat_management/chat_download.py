import json
import logging
import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict, Any


logger = logging.getLogger(__name__)

router = APIRouter()


class DownloadChatRequest(BaseModel):
    chat_sessions: Dict[str, Any]


class SaveSessionRequest(BaseModel):
    sessionId: str
    session: Dict[str, Any]


global_chat_history = {}  # Initialize
CHAT_DOCUMENT_DIR = "chat_units/chat_documents"

"""
@router.post("/download-chat-json")
async def download_chat_json(request: DownloadChatRequest):
    try:
        chat_data = request.chat_sessions
        if not chat_data or not isinstance(chat_data, dict):
            raise ValueError("无效的聊天数据格式")

        os.makedirs(CHAT_DOCUMENT_DIR, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"chat_session_{timestamp}.json"
        file_path = os.path.join(CHAT_DOCUMENT_DIR, filename)

        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(chat_data, f, indent=2, ensure_ascii=False)

        for session_id, session_data in chat_data.items():
            global_chat_history[session_id] = session_data

        json_data = json.dumps(chat_data, indent=2, ensure_ascii=False)
        file_stream = io.BytesIO(json_data.encode('utf-8'))
        response = StreamingResponse(
            content=file_stream,
            media_type="application/json",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )

        logger.info(f"成功生成并保存聊天文件: {file_path}")
        return response

    except Exception as e:
        logger.error(f"下载聊天数据失败: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"生成下载文件失败: {str(e)}"
        )
"""


# API
@router.get("/saved-chats")
async def get_saved_chats():
    try:
        saved_chats = []
        os.makedirs(CHAT_DOCUMENT_DIR, exist_ok=True)

        # JSON
        for filename in os.listdir(CHAT_DOCUMENT_DIR):
            if filename.endswith(".json"):
                file_path = os.path.join(CHAT_DOCUMENT_DIR, filename)
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        data = json.load(f)

                        session_id = next(iter(data["chat_sessions"].keys()))
                        session = data["chat_sessions"][session_id]
                        saved_chats.append(
                            {
                                "filename": filename,
                                "id": session_id,
                                "title": session.get("title", "无标题对话"),
                                "lastMessage": session.get("lastMessage", "无消息"),
                                "created_at": os.path.getctime(file_path),
                            }
                        )
                except Exception as e:
                    logger.error(f"解析文件 {filename} 失败: {str(e)}")

        saved_chats.sort(key=lambda x: x["created_at"], reverse=True)
        return JSONResponse(content=saved_chats)

    except Exception as e:
        logger.error(f"获取已保存对话失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取已保存对话失败: {str(e)}")


# API
@router.get("/load-chat/{filename}")
async def load_chat(filename: str):
    try:
        if ".." in filename or "/" in filename:
            raise ValueError("无效文件名")

        file_path = os.path.join(CHAT_DOCUMENT_DIR, filename)
        if not os.path.exists(file_path):
            raise FileNotFoundError("文件不存在")

        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return JSONResponse(content=data)

    except Exception as e:
        logger.error(f"加载对话文件失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"加载对话失败: {str(e)}")


# API
@router.get("/all-chats")
async def get_all_chats():
    return JSONResponse(content=global_chat_history)


@router.post("/save-session")
async def save_session(request: SaveSessionRequest):
    """保存单个对话会话到本地文件"""
    try:
        session_id = request.sessionId
        session_data = request.session

        os.makedirs(CHAT_DOCUMENT_DIR, exist_ok=True)

        # sessionId
        filename = f"session_{session_id}.json"
        file_path = os.path.join(CHAT_DOCUMENT_DIR, filename)

        save_data = {"chat_sessions": {session_id: session_data}}

        if os.path.exists(file_path):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    existing_data = json.load(f)
                existing_data["chat_sessions"][session_id] = session_data
                save_data = existing_data
            except Exception as e:
                logger.warning(f"读取现有文件失败，将创建新文件: {str(e)}")

        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(save_data, f, indent=2, ensure_ascii=False)

        global_chat_history[session_id] = session_data

        logger.info(f"会话 {session_id} 保存成功到文件: {filename}")
        return JSONResponse(
            content={
                "status": "success",
                "message": f"会话 {session_id} 保存成功",
                "filename": filename,
            }
        )

    except Exception as e:
        logger.error(f"保存会话失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"保存会话失败: {str(e)}")
