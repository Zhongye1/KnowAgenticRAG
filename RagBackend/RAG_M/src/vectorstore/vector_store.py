import os
import warnings
from typing import List, Optional

from dotenv import load_dotenv
from langchain.docstore.document import Document
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS

# 修改导入语句，使用正确的绝对导入
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from models.model_config import get_model_config

import json


os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"

load_dotenv()

#VECTORSTORE_PATH = os.getenv("VECTORSTORE_PATH")

class VectorStoreManager:
    """Manager for creating and loading FAISS vector stores"""
    def __init__(self, docs_dir: str = None):
        """Initialize vector store manager with embedding model from config file"""
        self._embeddings: Optional[HuggingFaceEmbeddings] = None
        # 优先使用配置文件中的模型，否则使用统一配置
        self._embedding_model = self._load_embedding_config(docs_dir)
        if not self._embedding_model:
            model_config = get_model_config()
            self._embedding_model = model_config.embedding_model

    def _load_embedding_config(self, docs_dir: str) -> str:
        """从knowledge_data.json加载embedding模型配置"""
        if not docs_dir:
            print("使用默认的 embedding 模型: sentence-transformers/all-MiniLM-L6-v2")
            return "sentence-transformers/all-MiniLM-L6-v2"
        
        # 获取knowledge_data.json路径
        config_path = os.path.join(docs_dir, "knowledge_data.json")
        
        try:
            if os.path.exists(config_path):
                with open(config_path, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                    print(f"加载embedding配置成功，使用模型: {config.get('embedding_model', 'sentence-transformers/all-MiniLM-L6-v2')}")
                    return config.get("embedding_model", "sentence-transformers/all-MiniLM-L6-v2")
            return "sentence-transformers/all-MiniLM-L6-v2"
        except Exception as e:
            print(f"加载embedding配置失败: {e}")
            return "sentence-transformers/all-MiniLM-L6-v2"


    @property
    def embeddings(self) -> HuggingFaceEmbeddings:
        """Lazy load and cache embeddings model（单例，只初始化一次）"""
        if self._embeddings is None:
            self._embeddings = HuggingFaceEmbeddings(model_name=self._embedding_model)
        return self._embeddings

    def create_vectorstore(self, documents: List[Document], save_path: str) -> FAISS:
        """Create and save a FAISS vector store from documents"""
        if not documents:
            raise ValueError("No documents provided to create vector store")
        
        save_path = os.path.abspath(os.path.normpath(save_path))
        print(f"Attempting to create vector store at: {save_path}")
        
        try:
            # 创建向量存储
            print(f"Creating FAISS vector store with {len(documents)} documents...")
            vectorstore = FAISS.from_documents(documents, self.embeddings)
            
            # 保存向量存储前确保目录存在
            print(f"Ensuring save directory exists: {save_path}")
            os.makedirs(save_path, exist_ok=True)
            
            # 创建临时目录用于保存
            temp_dir = os.path.join(save_path, "temp_save")
            os.makedirs(temp_dir, exist_ok=True)
            
            # 验证临时目录是否可写
            test_file = os.path.join(temp_dir, '.write_test')
            try:
                with open(test_file, 'w') as f:
                    f.write('test')
                os.remove(test_file)
                print("Temporary directory write permissions verified")
            except Exception as e:
                raise RuntimeError(f"Cannot write to temporary directory: {str(e)}")
            
            # 保存到临时目录
            print(f"Saving vector store to temporary directory: {temp_dir}")
            vectorstore.save_local(temp_dir)
            
            # 移动文件到最终位置
            import shutil
            for file in os.listdir(temp_dir):
                src = os.path.join(temp_dir, file)
                dst = os.path.join(save_path, file)
                shutil.move(src, dst)
            
            # 清理临时目录
            shutil.rmtree(temp_dir)
            
            print(f"Vector store successfully created and saved to {save_path}")
            
            # 验证文件是否创建成功
            required_files = ['index.faiss', 'index.pkl']
            for file in required_files:
                file_path = os.path.join(save_path, file)
                if not os.path.exists(file_path):
                    raise RuntimeError(f"Expected file not found after save: {file_path}")
                print(f"Verified file exists: {file_path}")
            
            return vectorstore
            
        except Exception as e:
            print(f"Error creating vector store: {str(e)}")
            print(f"Current working directory: {os.getcwd()}")
            print(f"Save path exists: {os.path.exists(save_path)}")
            if os.path.exists(save_path):
                print(f"Save path is writable: {os.access(save_path, os.W_OK)}")
                print(f"Contents of save directory: {os.listdir(save_path)}")
            raise

    
    def initialize_vectorstore(self, save_path: str):
        """Initialize an empty vector store with required files"""
        # 规范化路径并转换为绝对路径
        save_path = os.path.abspath(os.path.normpath(save_path))
        
        # 确保目录存在且有写权限
        try:
            # 创建目录（如果不存在）
            os.makedirs(save_path, exist_ok=True)
            
            # 再次检查目录是否存在
            if not os.path.exists(save_path):
                raise RuntimeError(f"Failed to create directory: {save_path}")
                
            # 测试目录是否可写
            test_file = os.path.join(save_path, '.write_test')
            try:
                with open(test_file, 'w') as f:
                    f.write('test')
                os.remove(test_file)
            except Exception as e:
                raise RuntimeError(f"Cannot write to vector store directory: {str(e)}")
                
        except Exception as e:
            raise RuntimeError(f"Cannot create vector store directory: {str(e)}")
        
        # 创建空的向量存储
        try:
            # 创建一个空的文档列表来初始化向量存储
            empty_docs = [Document(page_content="")]
            vectorstore = FAISS.from_documents(empty_docs, self.embeddings)
            
            # 确保目录存在
            os.makedirs(save_path, exist_ok=True)
            
            # 先尝试创建一个临时文件以确保我们可以写入
            temp_file = os.path.join(save_path, "temp_index.faiss")
            with open(temp_file, 'w') as f:
                f.write("")
            os.remove(temp_file)
            
            # 保存向量存储
            vectorstore.save_local(save_path)
            print(f"Successfully initialized vector store at {save_path}")
        except Exception as e:
            raise RuntimeError(f"Failed to initialize vector store: {str(e)}")


    def load_vectorstore(self, load_path: str, trust_source: bool = False) -> FAISS:
        """
        Load a FAISS vector store from disk
        
        Args:
            load_path: Path to the vector store
            trust_source: If True, allows deserialization of the vector store.
                        WARNING: Only set to True if you trust the source.
        
        Returns:
            FAISS vector store instance
            
        Raises:
            SecurityError: If trust_source is False
            RuntimeError: If loading fails
        """
        # 转换为绝对路径
        load_path = os.path.abspath(load_path)
        
        if not os.path.exists(load_path):
            raise FileNotFoundError(f"Vector store not found at {load_path}")

        if not trust_source:
            warnings.warn(
                "Loading vector stores requires deserializing pickle files, which can be unsafe. "
                "If you trust the source of this vector store (e.g., you created it), "
                "set trust_source=True. Never set trust_source=True with files from untrusted sources.",
                UserWarning
            )
            raise SecurityError("Refusing to load vector store without explicit trust_source=True")

        try:
            return FAISS.load_local(load_path, self.embeddings, allow_dangerous_deserialization=True)
        except RuntimeError as e:
            raise RuntimeError(f"Failed to load vector store from {load_path}. Error: {str(e)}")

class SecurityError(Exception):
    """Raised when attempting unsafe operations without explicit permission"""
    pass