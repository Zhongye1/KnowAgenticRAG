import os
from typing import List, Optional
from langchain_community.document_loaders import (
    PyPDFLoader,
    TextLoader,
    UnstructuredExcelLoader,
    CSVLoader,
    Docx2txtLoader,
    UnstructuredWordDocumentLoader
)


from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.document_loaders import (
    PyPDFLoader, TextLoader, CSVLoader,
    UnstructuredExcelLoader, Docx2txtLoader,
    UnstructuredWordDocumentLoader
)

import json



class DocumentLoader:
    # 定义需要忽略的文件
    IGNORED_EXTENSIONS = {'.json', '.log', '.tmp', '.bak', '.db', '.sqlite'}
    IGNORED_FILENAMES = {'knowledge_data.json', 'metadata.json', 'config.json'}
    IGNORED_DIRECTORIES = {'vectorstore', '__pycache__', '.git', 'node_modules'}


    def __init__(self, docs_dir: Optional[str] = None, chunk_size: Optional[int] = None, 
             chunk_overlap: Optional[int] = None):
        """
        初始化DocumentLoader
        
        Args:
            docs_dir: 知识库目录路径，用于读取配置
            chunk_size: 文档块大小（可选，优先级高于配置文件）
            chunk_overlap: 文档块重叠大小（可选，优先级高于配置文件）
        """
        # 从配置文件加载参数
        config = self._load_config(docs_dir) if docs_dir else {}
        print(f"文档初始化操作读取到的文件路径：{docs_dir}")
        print("读取的chunk_size:",config.get("chunk_size"))
        print("读取的chunk_overlap:",config.get("chunk_overlap"))


        # 参数优先级：函数参数 > 配置文件 > 默认值
        self.chunk_size = chunk_size or config.get("chunk_size", 1000)
        self.chunk_overlap = chunk_overlap or config.get("chunk_overlap", 200)
        
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
            separators=["\n\n", "\n", " ", ""]
        )
        """
        优先按段落（双换行符）分割
        其次按单个换行符分割
        然后按空格分割
        最后在必要时直接分割字符
        """



    def _load_config(self, docs_dir: str) -> dict:
        """
        从知识库目录下的knowledge_data.json加载配置
        
        Args:
            docs_dir: 知识库目录路径
            
        Returns:
            配置字典，包含chunk_size和chunk_overlap
        """
        config_path = os.path.join(docs_dir, "knowledge_data.json")
        config = {}
        
        try:
            if os.path.exists(config_path):
                with open(config_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    # 提取文档分块配置
                    config["chunk_size"] = data.get("chunk_size", 1000)
                    config["chunk_overlap"] = data.get("chunk_overlap", 200)
                    print(f"从 {config_path} 加载分块配置: chunk_size={config['chunk_size']}, "
                        f"chunk_overlap={config['chunk_overlap']}")
        except Exception as e:
            print(f"加载配置文件失败: {e}，使用默认配置")
        
        return config




    def should_skip_file(self, file_path: str) -> tuple[bool, str]:
        """
        判断是否应该跳过文件处理
        
        Returns:
            (should_skip: bool, reason: str)
        """
        filename = os.path.basename(file_path)
        file_extension = os.path.splitext(file_path)[1].lower()
        
        # 🔧 新增：检查文件路径是否包含需要忽略的目录
        path_parts = os.path.normpath(file_path).split(os.sep)
        for ignored_dir in self.IGNORED_DIRECTORIES:
            if ignored_dir in path_parts:
                return True, f"位于忽略目录 '{ignored_dir}' 中"
        
        # 跳过临时文件
        if filename.startswith('~$'):
            return True, "临时文件"
            
        # 跳过特定文件名
        if filename in self.IGNORED_FILENAMES:
            return True, "配置文件"
            
        # 跳过特定扩展名
        if file_extension in self.IGNORED_EXTENSIONS:
            return True, "不支持的文件类型"
            
        return False, ""
    
    def load_document(self, file_path: str, is_google_drive: bool = False) -> List:
        """
        Load and split a document based on its file type
        
        Args:
            file_path: Local file path or Google Drive file ID
            is_google_drive: Whether the file is from Google Drive
        """
        # 🔧 新增：检查是否应该跳过文件
        should_skip, skip_reason = self.should_skip_file(file_path)
        if should_skip:
            raise ValueError(f"Skipped file ({skip_reason}): {os.path.basename(file_path)}")
        
        if is_google_drive:
            if not self.google_drive_enabled:
                raise ValueError("Google Drive integration is not configured")
            try:
                file_path = self.google_drive_loader.download_file(file_path)
            except (IOError, OSError) as e:
                raise IOError(f"Error downloading from Google Drive: {str(e)}") from e
                
        file_extension = os.path.splitext(file_path)[1].lower()
        
        # 🔧 改进：更明确的错误处理
        if file_extension == '.pdf':
            try:
                loader = PyPDFLoader(file_path)
                documents = loader.load()
                # 如果解析内容为空，可能是扫描件，提示用户
                if not documents or all(not doc.page_content.strip() for doc in documents):
                    raise ValueError(f"PDF 解析内容为空，该文件可能是扫描件或加密文件：{os.path.basename(file_path)}")
            except Exception as pdf_err:
                # 尝试使用 pdfplumber 作为备选
                try:
                    import pdfplumber
                    text_pages = []
                    with pdfplumber.open(file_path) as pdf:
                        for i, page in enumerate(pdf.pages):
                            text = page.extract_text() or ''
                            if text.strip():
                                from langchain.schema import Document
                                text_pages.append(Document(
                                    page_content=text,
                                    metadata={"source": file_path, "page": i}
                                ))
                    if text_pages:
                        documents = text_pages
                        print(f"[PDF fallback] 使用 pdfplumber 成功解析 {os.path.basename(file_path)}")
                    else:
                        raise ValueError(f"PDF 内容为空（可能是扫描件）：{os.path.basename(file_path)}")
                except ImportError:
                    # pdfplumber 未安装，给出明确错误
                    raise ValueError(f"PDF 解析失败（{pdf_err}）。建议安装 pdfplumber: pip install pdfplumber，或将 PDF 转为 TXT 后上传。")
        elif file_extension in ['.txt', '.md']:
            try:
                # 1. 规范化路径，解决反斜杠问题
                normalized_path = os.path.normpath(file_path)
                # 2. 首先尝试utf-8编码
                loader = TextLoader(normalized_path, encoding='utf-8')
                documents = loader.load()
            except UnicodeDecodeError:
                # 3. 如果utf-8失败，尝试使用latin-1编码（更宽容的编码）
                loader = TextLoader(normalized_path, encoding='latin-1')
                documents = loader.load()
            except Exception as e:
                # 4. 其他错误的详细日志
                print(f"Error loading text file {file_path}: {str(e)}")
                raise ValueError(f"Error loading {file_path}: {str(e)}")
        elif file_extension in ['.xlsx', '.xls']:
            loader = UnstructuredExcelLoader(file_path)
        elif file_extension == '.csv':
            loader = CSVLoader(file_path)
        elif file_extension == '.docx':
            try:
                loader = Docx2txtLoader(file_path)
            except (ImportError, IOError):
                loader = UnstructuredWordDocumentLoader(file_path)
        else:
            raise ValueError(f"Unsupported file type: {file_extension}")
            
        # 仅当尚未加载documents时才调用loader.load()
        if 'documents' not in locals():
            documents = loader.load()
        return self.text_splitter.split_documents(documents)
