# chunk_management.py

from fastapi import UploadFile, File, APIRouter, HTTPException, Form
from typing import List
from pydantic import BaseModel
import os
import hashlib
from datetime import datetime
import aiofiles
from pathlib import Path
import asyncio
import shutil
from fastapi import Request  # Request


router = APIRouter()


"""
CURD实现CREATE

1. 文件分块上传
接收分块文件：通过/api/upload-chunk/接口接收文件分块
存储临时分块：将上传的分块保存到临时目录中
分块标识管理：使用文件哈希和索引标识不同分块

2. 文件分块合并
合并完整文件：通过/api/upload-complete/接口将所有分块合并为完整文件
参数验证：验证必要参数(fileHash, fileName, totalChunks, KLB_id)是否完整
完整性检查：检查所有分块是否已全部上传
重复文件检测：检查合并后的文件是否与已有文件重复

3. 文件验证功能
类型验证：检查文件扩展名是否在允许列表中
大小限制：限制上传文件大小不超过50MB
文件哈希计算：为每个文件生成唯一MD5哈希值

4. 文件切分与分析
文本分块计算：根据不同分块策略(按段落、固定长度、按句子)计算文档分块数量
文件元数据提取：获取文件类型、大小等元数据信息

5. 文件元数据管理
文档记录创建：为每个上传文件创建包含详细信息的元数据记录
存储路径管理：基于知识库ID和时间戳生成唯一文件名和存储路径
重复文件处理：检测并处理文件重复上传情况

"""


# File upload
UPLOAD_DIR = "local-KLB-files"
METADATA_DIR = "metadata"
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".doc", ".md", ".rtf"}

# IO 8
_chunk_semaphore = asyncio.Semaphore(8)

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(METADATA_DIR, exist_ok=True)

METADATA_FILE = os.path.join(METADATA_DIR, "documents.json")

# Temporary directory
CHUNK_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "chunks")
os.makedirs(CHUNK_UPLOAD_DIR, exist_ok=True)


# Pydantic
class DocumentStatus(BaseModel):
    documentId: int
    enabled: bool


class DeleteDocuments(BaseModel):
    documentIds: List[int]


class DocumentResponse(BaseModel):
    id: int
    name: str
    fileType: str
    chunks: int
    uploadDate: str
    slicingMethod: str
    enabled: bool
    file_size: int
    file_hash: str


# Document management

from .doc_manage import LocalDocumentManager

# Document management
doc_manager = LocalDocumentManager()


def get_file_hash(content: bytes) -> str:
    """生成文件的MD5哈希值"""
    return hashlib.md5(content).hexdigest()


def get_file_type(filename: str) -> str:
    """获取文件扩展名"""
    return Path(filename).suffix.lower()


def validate_file(filename: str, content: bytes) -> tuple[bool, str]:
    """验证文件类型和大小"""
    file_ext = get_file_type(filename)

    if file_ext not in ALLOWED_EXTENSIONS:
        return False, f"不支持的文件类型: {file_ext}"

    if len(content) > MAX_FILE_SIZE:
        return False, f"文件大小超过限制 ({MAX_FILE_SIZE / 1024 / 1024:.1f}MB)"

    return True, "验证通过"


@router.post("/api/upload-chunk/")
async def upload_chunk(
    chunk: UploadFile = File(...),
    fileHash: str = Form(...),
    chunkIndex: int = Form(...),
    totalChunks: int = Form(...),
    fileName: str = Form(...),
    KLB_id: str = Form(...),
):
    """
    上传文件分块（使用 Semaphore 限流，最多 8 个并发写入）
    """
    async with _chunk_semaphore:
        try:
            file_chunk_dir = os.path.join(CHUNK_UPLOAD_DIR, KLB_id, fileHash)
            os.makedirs(file_chunk_dir, exist_ok=True)

            chunk_file_path = os.path.join(file_chunk_dir, f"chunk_{chunkIndex}.part")

            async with aiofiles.open(chunk_file_path, "wb") as f:
                content = await chunk.read()
                await f.write(content)

            print(
                f"分块上传成功: 文件名={fileName}, 文件哈希={fileHash}, 分块索引={chunkIndex}, 总分块数={totalChunks}"
            )
            return {
                "message": "分块上传成功",
                "fileHash": fileHash,
                "chunkIndex": chunkIndex,
                "totalChunks": totalChunks,
            }
        except Exception as e:
            print(f"分块上传失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"分块上传失败: {str(e)}")


@router.post("/api/upload-complete/")
async def upload_complete(request: Request):
    """
    合并文件分块
    """
    try:
        # JSON
        data = await request.json()
        fileHash = data.get("fileHash")
        fileName = data.get("fileName")
        totalChunks = data.get("totalChunks")
        KLB_id = data.get("KLB_id")

        print(
            f"接收到的请求参数: fileHash={fileHash}, fileName={fileName}, totalChunks={totalChunks}, KLB_id={KLB_id}"
        )

        if not all([fileHash, fileName, totalChunks, KLB_id]):
            raise HTTPException(status_code=400, detail="缺少必要参数")

        print(
            f"接收到的请求参数: fileHash={fileHash}, fileName={fileName}, totalChunks={totalChunks}, KLB_id={KLB_id}"
        )
        file_chunk_dir = os.path.join(CHUNK_UPLOAD_DIR, KLB_id, fileHash)

        if not os.path.exists(file_chunk_dir):
            print(f"分块目录 {file_chunk_dir} 不存在")
            raise HTTPException(status_code=400, detail="分块目录不存在")
        uploaded_chunks = os.listdir(file_chunk_dir)
        print(f"上传的分块数量: {len(uploaded_chunks)}, 预期分块数量: {totalChunks}")
        if len(uploaded_chunks) != totalChunks:
            raise HTTPException(status_code=400, detail="分块未全部上传")

        file_ext = get_file_type(fileName)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        saved_filename = f"{fileName}-{timestamp}_{fileHash[:8]}{file_ext}"
        final_file_path = os.path.join(UPLOAD_DIR, KLB_id, saved_filename)

        os.makedirs(os.path.dirname(final_file_path), exist_ok=True)

        # asyncio.to_thread event loop
        def _merge_chunks():
            with open(final_file_path, "wb") as outfile:
                for i in range(totalChunks):
                    chunk_file_path = os.path.join(file_chunk_dir, f"chunk_{i}.part")
                    if not os.path.exists(chunk_file_path):
                        raise FileNotFoundError(f"分块文件 {chunk_file_path} 不存在")
                    with open(chunk_file_path, "rb") as infile:
                        shutil.copyfileobj(infile, outfile)

        await asyncio.to_thread(_merge_chunks)

        print(
            f"文件合并成功: 文件名={fileName}, 文件哈希={fileHash}, 总分块数={totalChunks}, 最终文件路径={final_file_path}"
        )

        # - 2Calculate file hash -
        # : content = await f.read() 50MBN =
        # : MD5 64KB
        def _compute_hash_and_size(path: str):
            """流式读取文件，计算 MD5 哈希与文件大小，不把文件载入内存"""
            md5 = hashlib.md5()
            size = 0
            with open(path, "rb") as f:
                for block in iter(lambda: f.read(65536), b""):
                    md5.update(block)
                    size += len(block)
            return md5.hexdigest(), size

        existing_file_hash, file_size = await asyncio.to_thread(
            _compute_hash_and_size, final_file_path
        )

        file_ext_check = get_file_type(fileName)
        if file_ext_check not in ALLOWED_EXTENSIONS:
            os.remove(final_file_path)
            raise HTTPException(
                status_code=400, detail=f"不支持的文件类型: {file_ext_check}"
            )
        if file_size > MAX_FILE_SIZE:
            os.remove(final_file_path)
            raise HTTPException(
                status_code=400,
                detail=f"文件大小超过限制 ({MAX_FILE_SIZE / 1024 / 1024:.1f}MB)",
            )
        existing_docs = [
            doc
            for doc in doc_manager.get_all_documents()
            if doc.get("file_hash") == existing_file_hash
        ]

        if existing_docs:
            for doc in existing_docs:
                await doc_manager.delete_document(doc["id"], KLB_id)
                print(f"更新文件: {doc['name']}，{KLB_id}")

        slicing_method = "按段落"
        estimated_chunks = max(1, file_size // 1024)  # 1KB1

        document_data = {
            "id": None,  # add_document
            "name": fileName,
            "fileType": file_ext.replace(".", ""),
            "chunks": estimated_chunks,
            "uploadDate": datetime.now().strftime("%Y-%m-%d"),
            "slicingMethod": slicing_method,
            "enabled": True,
            "file_size": file_size,
            "file_hash": existing_file_hash,
            "file_path": final_file_path,
            "created_at": datetime.now().isoformat(),
        }

        doc_id = await doc_manager.add_document(document_data)
        document_data["id"] = doc_id

        # Temporary directory
        shutil.rmtree(file_chunk_dir)

        return {
            "success": True,
            "message": "文件合并成功",
            "fileId": doc_id,
            "fileName": fileName,
            "filePath": final_file_path,
            "chunks": estimated_chunks,
            "slicingMethod": slicing_method,
        }
    except HTTPException as http_exc:
        print(f"HTTP异常: {http_exc.detail}")
        raise
    except Exception as e:
        print(f"文件合并失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"文件合并失败: {str(e)}")


def calculate_chunks(content: bytes, slicing_method: str = "按段落") -> int:
    """计算文件分块数量"""
    try:
        content_str = content.decode("utf-8", errors="ignore")
    except:
        return 1

    if slicing_method == "按段落":
        chunks = len([p for p in content_str.split("\n\n") if p.strip()])
    elif slicing_method == "固定长度":
        # 1000
        chunk_size = 1000
        chunks = len(content_str) // chunk_size + (
            1 if len(content_str) % chunk_size else 0
        )
    else:
        chunks = len([s for s in content_str.split(".") if s.strip()])

    return max(1, chunks)
