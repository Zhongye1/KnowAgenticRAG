from fastapi import APIRouter, HTTPException

from pydantic import BaseModel
import os
from datetime import datetime
from pathlib import Path

router = APIRouter()


from typing import List


UPLOAD_DIR = "local-KLB-files"
# UPLOAD_DIR
os.makedirs(UPLOAD_DIR, exist_ok=True)


class DocumentInfo(BaseModel):
    id: int
    file_name: str
    file_path: str
    file_size: int
    file_type: str
    upload_time: datetime
    status: str


class FolderInfo(BaseModel):
    folder_path: str
    folder_name: str
    document_count: int
    total_size: int
    documents: List[DocumentInfo]


class AllDocumentsResponse(BaseModel):
    folders: List[FolderInfo]
    total_folders: int
    total_documents: int
    total_size: int


class DocumentPreviewResponse(BaseModel):
    file_name: str
    file_path: str
    file_size: int
    file_type: str
    upload_time: datetime
    content_preview: str
    status: str


class DeleteDocumentResponse(BaseModel):
    message: str
    file_name: str
    status: str


class DocumentManager:
    def __init__(self, upload_dir):
        self.upload_dir = upload_dir

    def get_all_documents_info(self):
        """获取所有文件夹及其文档信息"""
        kb_folders = []
        if os.path.exists(self.upload_dir):
            for item in os.listdir(self.upload_dir):
                item_path = os.path.join(self.upload_dir, item)
                # chunks covers
                if os.path.isdir(item_path) and item not in ["chunks", "covers"]:
                    kb_folders.append(item)

        all_info = []
        for folder in kb_folders:
            folder_info = {
                "folder_path": os.path.join(self.upload_dir, folder),
                "folder_name": folder,
                "document_count": 0,
                "total_size": 0,
                "documents": [],
            }

            documents = self.search_documents(folder)
            folder_info["document_count"] = len(documents)
            folder_info["total_size"] = sum(
                doc.get("file_size", 0) for doc in documents
            )
            folder_info["documents"] = documents

            all_info.append(folder_info)

        return all_info

    def search_documents(self, folder_name):
        """搜索指定文件夹下的文档"""
        documents = []
        folder_path = os.path.join(self.upload_dir, folder_name)

        if not os.path.exists(folder_path):
            return documents

        for item in os.listdir(folder_path):
            item_path = os.path.join(folder_path, item)
            if os.path.isfile(item_path):
                file_stat = os.stat(item_path)
                file_ext = os.path.splitext(item)[1].lower()

                supported_extensions = {
                    ".pdf",
                    ".doc",
                    ".docx",
                    ".xls",
                    ".xlsx",
                    ".csv",
                    ".txt",
                    ".md",
                }

                if file_ext in supported_extensions:
                    documents.append(
                        {
                            "id": abs(hash(item_path.replace("\\", "/")))
                            % (2**31),  # ID
                            "file_name": item,
                            "file_path": item_path,
                            "file_size": file_stat.st_size,
                            "file_type": file_ext[1:],
                            "upload_time": datetime.fromtimestamp(file_stat.st_ctime),
                            "status": "enabled",
                        }
                    )

        return documents

    def preview_document(self, file_path: str) -> dict:
        """预览文档内容"""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"文件不存在: {file_path}")

        file_stat = os.stat(file_path)
        file_name = os.path.basename(file_path)
        file_ext = os.path.splitext(file_name)[1].lower()

        content_preview = ""

        # 1000
        if file_ext in [".txt", ".md", ".csv"]:
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    content_preview = f.read(1000)
            except UnicodeDecodeError:
                # UTF-8
                try:
                    with open(file_path, "r", encoding="gbk") as f:
                        content_preview = f.read(1000)
                except UnicodeDecodeError:
                    content_preview = "无法预览此文件内容（编码格式不支持）"
        # Wordpython-docx
        elif file_ext == ".docx":
            try:
                from docx import Document

                doc = Document(file_path)
                paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
                content_preview = "\n".join(paragraphs[:20])  # 20
            except Exception as e:
                content_preview = f"无法预览此Word文档内容：{str(e)}"
        # PDF pdfplumber PyPDF2
        elif file_ext == ".pdf":
            try:
                import pdfplumber

                with pdfplumber.open(file_path) as pdf:
                    text_parts = []
                    for page in pdf.pages[:5]:  # 5
                        t = page.extract_text() or ""
                        if t.strip():
                            text_parts.append(t)
                    content_preview = "\n".join(text_parts)[:1000]
                if not content_preview.strip():
                    raise ValueError("pdfplumber 提取内容为空，尝试 PyPDF2")
            except Exception:
                try:
                    import PyPDF2

                    with open(file_path, "rb") as f:
                        pdf_reader = PyPDF2.PdfReader(f)
                        text_parts = []
                        for i in range(min(5, len(pdf_reader.pages))):
                            page = pdf_reader.pages[i]
                            t = page.extract_text() or ""
                            text_parts.append(t)
                        content_preview = "\n".join(text_parts)[:1000]
                    if not content_preview.strip():
                        content_preview = "（PDF 内容为纯图像或已加密，无法提取文字）"
                except Exception as e2:
                    content_preview = f"无法预览此PDF文档内容：{str(e2)}"
        else:
            content_preview = f" {file_ext} 文件，暂时无法直接预览内容。"

        return {
            "file_name": file_name,
            "file_path": file_path,
            "file_size": file_stat.st_size,
            "file_type": file_ext[1:],
            "upload_time": datetime.fromtimestamp(file_stat.st_ctime),
            "content_preview": content_preview,
            "status": "enabled",
        }

    def delete_document(self, file_path: str) -> bool:
        """删除文档"""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"文件不存在: {file_path}")

        if not os.path.isfile(file_path):
            raise ValueError(f"路径不是文件: {file_path}")

        os.remove(file_path)
        return True


doc_manager = DocumentManager(UPLOAD_DIR)


@router.get("/api/all-documents/", response_model=AllDocumentsResponse)
async def get_all_documents_info():
    """
    获取local-KLB-files下所有文件夹及其文档信息

    返回信息包括：
    - 所有文件夹列表
    - 每个文件夹的文档数量
    - 每个文件夹的总大小
    - 每个文档的详细信息
    - 全局统计信息
    """
    try:
        print(f"从文件夹 {UPLOAD_DIR} 获取文档信息")
        folders_info = doc_manager.get_all_documents_info()

        total_folders = len(folders_info)
        total_documents = sum(folder["document_count"] for folder in folders_info)
        total_size = sum(folder["total_size"] for folder in folders_info)

        return {
            "folders": folders_info,
            "total_folders": total_folders,
            "total_documents": total_documents,
            "total_size": total_size,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取文档信息失败: {str(e)}")


@router.get("/api/document/preview/", response_model=DocumentPreviewResponse)
async def preview_document(file_path: str):
    """
    预览文档内容

    参数:
    - file_path: 文档的完整路径

    返回:
    - 文档的基本信息和内容预览
    """
    try:
        print(f"开始预览文档: {file_path}")
        # - Windows Path.resolve -
        try:
            abs_file_path = Path(file_path).resolve()
            abs_upload_dir = Path(UPLOAD_DIR).resolve()
        except Exception:
            raise HTTPException(status_code=400, detail="无效的文件路径")

        print(f"文件绝对路径: {abs_file_path}")
        print(f"上传目录绝对路径: {abs_upload_dir}")

        # Windows Path.resolve() is_relative_to Python 3.9+
        # resolve
        try:
            abs_file_path.relative_to(abs_upload_dir)  # ValueError
        except ValueError:
            print(f"访问被拒绝: 文件路径 {file_path} 不在允许的目录内")
            raise HTTPException(status_code=403, detail="无权访问此文件路径")

        print("调用doc_manager.preview_document方法")
        # open() Windows
        preview_info = doc_manager.preview_document(str(abs_file_path))
        print(f"文档预览成功: {file_path}")
        return preview_info
    except HTTPException:
        raise
    except FileNotFoundError as e:
        print(f"文件未找到错误: {str(e)}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        print(f"预览文档时发生未知错误: {str(e)}")
        raise HTTPException(status_code=500, detail=f"预览文档失败: {str(e)}")


@router.delete("/api/document/", response_model=DeleteDocumentResponse)
async def delete_document(file_path: str):
    """
    删除文档

    参数:
    - file_path: 文档的完整路径

    返回:
    - 删除操作的结果信息
    """
    try:
        print(f"开始删除文档: {file_path}")
        # - Windows -
        try:
            abs_file_path = Path(file_path).resolve()
            abs_upload_dir = Path(UPLOAD_DIR).resolve()
        except Exception:
            raise HTTPException(status_code=400, detail="无效的文件路径")

        print(f"文件绝对路径: {abs_file_path}")
        print(f"上传目录绝对路径: {abs_upload_dir}")

        try:
            abs_file_path.relative_to(abs_upload_dir)
        except ValueError:
            print(f"删除被拒绝: 文件路径 {file_path} 不在允许的目录内")
            raise HTTPException(status_code=403, detail="无权访问此文件路径")

        print("调用doc_manager.delete_document方法")
        result = doc_manager.delete_document(str(abs_file_path))
        print(f"文档删除成功: {file_path}")

        if result:
            return {
                "message": "文档删除成功",
                "file_name": os.path.basename(file_path),
                "status": "success",
            }
    except HTTPException:
        raise
    except FileNotFoundError as e:
        print(f"文件未找到错误: {str(e)}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        print(f"删除文档时发生未知错误: {str(e)}")
        raise HTTPException(status_code=500, detail=f"删除文档失败: {str(e)}")
