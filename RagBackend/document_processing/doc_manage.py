from fastapi import UploadFile, File, APIRouter, HTTPException , Form
from fastapi.responses import JSONResponse
from typing import List, Optional
from pydantic import BaseModel
import os
import json
import hashlib
from datetime import datetime
import aiofiles
from pathlib import Path
import asyncio

router = APIRouter()

# ── 全局元数据写锁（防并发竞态）────────────────────────────────────
# asyncio.Lock 保证同一进程内所有协程对 documents.json 的读写串行化，
# 彻底消除并发上传时元数据丢失/损坏的竞态条件。
_metadata_lock = asyncio.Lock()


"""
CURD实现UPDATE,READ,DELETE

1. 文档元数据管理
加载文档元数据：从本地JSON文件读取文档的元数据信息
保存文档元数据：将文档元数据保存到本地JSON文件
添加新文档：将新文档信息添加到系统并分配唯一ID
获取单个文档：根据ID获取特定文档的详细信息
获取所有文档：获取系统中所有文档的列表
更新文档信息：修改现有文档的属性信息
删除文档：从系统中删除指定的文档及其物理文件

2. 文档搜索功能
按知识库ID搜索文档：根据知识库ID获取对应的文档列表
简单关键词搜索：支持在文档内容中进行关键词匹配搜索

3. 统计功能
获取总文档数：统计系统中所有文档的数量
获取启用/禁用文档数：分别统计启用和禁用状态的文档数量
获取总文档大小：计算所有文档占用的存储空间
按文件类型统计：统计不同文件类型文档的数量分布

4. API端点
更新文档状态 /api/update-document-status/：启用或禁用特定文档
批量删除文档 /api/delete-documents/：一次性删除多个文档
知识库搜索测试 /api/search-test/：通过关键词在知识库中执行搜索测试
获取系统统计信息 /api/stats/：获取文档系统的各种统计数据
获取文档列表 /api/documents-list/{KLB_id}/：获取特定知识库下的所有文档

5. 数据模型
DocumentStatus：表示文档启用状态的模型
DeleteDocuments：用于批量删除文档的请求模型
DocumentResponse：文档响应的数据模型，包含文档的所有属性

"""




# 添加模型配置导入
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from models.model_config import get_model_config

# 获取默认的rerank模型
model_config = get_model_config()
DEFAULT_RERANK_MODEL = model_config.rerank_model


# 配置文件上传相关设置
UPLOAD_DIR = "local-KLB-files"
METADATA_DIR = "metadata"
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".doc", ".md", ".rtf"}

# 确保目录存在
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(METADATA_DIR, exist_ok=True)

METADATA_FILE = os.path.join(METADATA_DIR, "documents.json")

# Pydantic 模型
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

# 本地文档管理类
class LocalDocumentManager:
    """
    文档元数据管理器。

    并发安全设计：
    - 所有读写操作通过模块级 `_metadata_lock`（asyncio.Lock）保护，
      保证同进程内并发上传时不产生竞态条件。
    - 同步方法（add_document / delete_document 等）供 async 方法在锁内调用；
      外部 API 层应通过 async 包装方法访问（见下方 async 辅助方法）。
    """

    def __init__(self):
        self.metadata_file = METADATA_FILE
        # 初始化时加载一次作为缓存；后续写操作会同步更新内存缓存
        self.documents = self._load_documents()

    # ── 内部同步 IO（只在锁内调用）──────────────────────────────

    def _load_documents(self) -> dict:
        """从本地JSON文件加载文档元数据（同步，仅供锁内调用）"""
        if os.path.exists(self.metadata_file):
            try:
                with open(self.metadata_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"加载文档元数据失败: {e}")
                return {}
        return {}

    def _save_documents(self):
        """
        原子写：先写临时文件，再 rename 替换，避免写到一半时进程崩溃导致文件损坏。
        """
        tmp_path = self.metadata_file + ".tmp"
        try:
            with open(tmp_path, 'w', encoding='utf-8') as f:
                json.dump(self.documents, f, ensure_ascii=False, indent=2)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp_path, self.metadata_file)  # 原子替换
        except Exception as e:
            print(f"保存文档元数据失败: {e}")
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass

    # ── 业务方法（均在锁内调用）──────────────────────────────────

    def _add_document_locked(self, doc_data: dict) -> int:
        """添加新文档（需在锁内调用）"""
        # 从磁盘重新加载，确保拿到最新版本
        self.documents = self._load_documents()
        doc_id = max(map(int, self.documents.keys()), default=0) + 1
        doc_data['id'] = doc_id
        self.documents[str(doc_id)] = doc_data
        self._save_documents()
        return doc_id

    def _update_document_locked(self, doc_id: int, updates: dict) -> bool:
        """更新文档信息（需在锁内调用）"""
        self.documents = self._load_documents()
        if str(doc_id) in self.documents:
            self.documents[str(doc_id)].update(updates)
            self.documents[str(doc_id)]['updated_at'] = datetime.now().isoformat()
            self._save_documents()
            return True
        return False

    def _delete_document_locked(self, doc_id: int, KLB_id: str) -> bool:
        """删除文档（需在锁内调用）"""
        self.documents = self._load_documents()
        if str(doc_id) in self.documents:
            doc = self.documents[str(doc_id)]
            # 删除物理文件
            if 'file_path' in doc and os.path.exists(doc['file_path']):
                try:
                    os.remove(doc['file_path'])
                    print(f"删除文件成功: {doc['file_path']}")
                except Exception as e:
                    print(f"删除文件失败: {e}")
            del self.documents[str(doc_id)]
            self._save_documents()
            return True
        return False

    # ── 公开 async 方法（加锁后调用内部同步方法）────────────────

    async def add_document(self, doc_data: dict) -> int:
        """添加新文档（协程安全）"""
        async with _metadata_lock:
            return self._add_document_locked(doc_data)

    async def update_document(self, doc_id: int, updates: dict) -> bool:
        """更新文档信息（协程安全）"""
        async with _metadata_lock:
            return self._update_document_locked(doc_id, updates)

    async def delete_document(self, doc_id: int, KLB_id: str) -> bool:
        """删除文档（协程安全）"""
        async with _metadata_lock:
            return self._delete_document_locked(doc_id, KLB_id)

    # ── 只读方法（读磁盘，无写竞争，无需加锁）────────────────────

    def get_document(self, doc_id: int) -> dict:
        """获取单个文档（读取磁盘最新版本）"""
        docs = self._load_documents()
        return docs.get(str(doc_id))

    def get_all_documents(self) -> List[dict]:
        """获取所有文档（读取磁盘最新版本）"""
        return list(self._load_documents().values())

    def search_documents(self, KLB_id: str, search_term: str = None, status: str = None) -> List[dict]:
        """按知识库ID搜索文档（读取磁盘最新版本）"""
        kb_dir = os.path.join(UPLOAD_DIR, KLB_id)
        if not os.path.exists(kb_dir):
            return []

        files = []
        with os.scandir(kb_dir) as entries:
            for entry in entries:
                if entry.is_file():
                    files.append(entry.name)

        documents = self._load_documents()
        results = []
        for file in files:
            file_path = os.path.join(kb_dir, file)
            for doc in documents.values():
                if doc.get('file_path') == file_path:
                    results.append(doc)
                    break

        return results

    # ── 统计方法（只读，无需加锁）────────────────────────────────

    def get_total_documents(self) -> int:
        """获取文档总数"""
        return len(self._load_documents())

    def get_enabled_documents(self) -> int:
        """获取启用文档的数量"""
        return sum(1 for doc in self._load_documents().values() if doc.get('enabled', True))

    def get_disabled_documents(self) -> int:
        """获取禁用文档的数量"""
        return sum(1 for doc in self._load_documents().values() if not doc.get('enabled', True))

    def get_total_size(self) -> int:
        """获取所有文档的总大小"""
        return sum(doc.get('file_size', 0) for doc in self._load_documents().values())

    def get_file_types(self) -> dict:
        """按文件类型统计文档数量"""
        file_types = {}
        for doc in self._load_documents().values():
            file_type = doc.get('fileType', 'unknown')
            file_types[file_type] = file_types.get(file_type, 0) + 1
        return file_types


# 创建文档管理器实例
doc_manager = LocalDocumentManager()

@router.post("/api/update-document-status/")
async def update_document_status(status: DocumentStatus):
    """
    更新文档启用状态
    """
    try:
        success = await doc_manager.update_document(status.documentId, {"enabled": status.enabled})
        
        print(f"更新文档是否成功: {success}")
        print(f"文档ID: {status.documentId}")
        if not success:
            print("文档不存在", status.documentId)
            raise HTTPException(status_code=404, detail="文档不存在")

        
        return {
            "message": "文档状态更新成功",
            "documentId": status.documentId,
            "enabled": status.enabled,
            "updatedAt": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新文档状态失败: {str(e)}")

@router.post("/api/delete-documents/")
async def delete_documents(KLB_id: str, delete_request: DeleteDocuments):
    """
    批量删除文档
    """
    print("删除文档请求", delete_request)
    try:
        deleted_files = []
        not_found_files = []
        
        for doc_id in delete_request.documentIds:
            if await doc_manager.delete_document(doc_id, KLB_id):
                deleted_files.append(doc_id)
            else:
                not_found_files.append(doc_id)
        
        return {
            "message": "文档删除操作完成",
            "deleted": deleted_files,
            "notFound": not_found_files,
            "totalDeleted": len(deleted_files),
            "deletedAt": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除文档失败: {str(e)}")
    

# 知识库搜索测试端点
@router.post("/api/search-test/")
async def search_test(
    query: str,
    similarity_threshold: float = 0.75,
    keyword_weight: int = 50,
    rerank_model: str = DEFAULT_RERANK_MODEL,
    use_knowledge_graph: bool = False,
    selected_documents: List[int] = []
):
    """
    执行知识库搜索测试
    """
    try:
        # 获取要搜索的文档
        search_docs = []
        if selected_documents:
            for doc_id in selected_documents:
                doc = doc_manager.get_document(doc_id)
                if doc and doc.get('enabled', True):
                    search_docs.append(doc)
        else:
            # 搜索所有启用的文档
            search_docs = [doc for doc in doc_manager.get_all_documents() 
                          if doc.get('enabled', True)]
        
        # 简单的关键词匹配搜索（实际应用中应该使用向量搜索）
        mock_results = []
        for doc in search_docs:
            file_path = doc.get('file_path')
            if file_path and os.path.exists(file_path):
                try:
                    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()
                    
                    # 简单的关键词匹配
                    if query.lower() in content.lower():
                        # 提取包含关键词的片段
                        lines = content.split('\n')
                        relevant_lines = [line for line in lines if query.lower() in line.lower()]
                        
                        if relevant_lines:
                            mock_results.append({
                                "source": doc['name'],
                                "content": relevant_lines[0][:200] + "..." if len(relevant_lines[0]) > 200 else relevant_lines[0],
                                "file": doc['name'],
                                "chunk": 1,
                                "score": 0.85  # 模拟相似度分数
                            })
                except:
                    continue
        
        return {
            "results": mock_results,
            "query": query,
            "total_results": len(mock_results),
            "search_time": 0.5,  # 搜索耗时（秒）
            "searched_documents": len(search_docs),
            "parameters": {
                "similarity_threshold": similarity_threshold,
                "keyword_weight": keyword_weight,
                "rerank_model": rerank_model,
                "use_knowledge_graph": use_knowledge_graph
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"搜索测试失败: {str(e)}")

# 获取系统统计信息
@router.get("/api/stats/")
async def get_stats():
    """
    获取系统统计信息
    """
    try:
        total_docs = doc_manager.get_total_documents()
        enabled_docs = doc_manager.get_enabled_documents()
        disabled_docs = doc_manager.get_disabled_documents()
        total_size = doc_manager.get_total_size()
        file_types = doc_manager.get_file_types()

        return {
            "totalDocuments": total_docs,
            "enabledDocuments": enabled_docs,
            "disabledDocuments": disabled_docs,
            "totalSize": total_size,
            "totalSizeMB": round(total_size / (1024 * 1024), 2),
            "fileTypes": file_types,
            "uploadDir": UPLOAD_DIR,
            "diskUsage": {
                "used": total_size,
                "usedMB": round(total_size / (1024 * 1024), 2)
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取统计信息失败: {str(e)}")
@router.get("/api/documents-list/{KLB_id}/", response_model=List[DocumentResponse])
async def get_documents(KLB_id):
    """
    获取文档列表
    """
    try:
        # 打印接收到的 KLB_id 参数
        print(f"Received KLB_id: {KLB_id}")
        
        # 获取文档列表
        documents = doc_manager.search_documents(KLB_id)
        
        # 打印搜索结果
        #print(f"Documents for KLB_id {KLB_id}: {documents}")
        
        return documents
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取文档列表失败: {str(e)}")

