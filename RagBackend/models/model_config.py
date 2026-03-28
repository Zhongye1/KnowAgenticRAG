from typing import Optional
import os
from pathlib import Path
import json

class ModelConfig:
    """统一模型配置管理类"""
    
    # Model config qwen2:0.5b400MB
    DEFAULT_LLM_MODEL = "qwen2:0.5b"
    DEFAULT_EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
    DEFAULT_RERANK_MODEL = "bge-large"
    DEFAULT_KG_MODEL = "qwen2:0.5b"
    
    def __init__(self, config_path: Optional[str] = None):
        """
        初始化模型配置
        
        Args:
            config_path: 配置文件路径，如果未提供则使用环境变量和默认值
        """
        self.config_path = config_path
        self._config = {}
        
        if config_path and os.path.exists(config_path):
            self._load_config_from_file()
        else:
            self._load_config_from_env()
    
    def _load_config_from_file(self):
        """从配置文件加载模型配置"""
        try:
            with open(self.config_path, 'r', encoding='utf-8') as f:
                self._config = json.load(f)
        except Exception as e:
            print(f"加载配置文件失败: {e}，使用环境变量和默认配置")
            self._load_config_from_env()
    
    def _load_config_from_env(self):
        """从环境变量加载模型配置"""
        self._config = {
            "llm_model": os.getenv("MODEL", self.DEFAULT_LLM_MODEL),
            "embedding_model": os.getenv("EMBEDDING_MODEL", self.DEFAULT_EMBEDDING_MODEL),
            "rerank_model": os.getenv("RERANK_MODEL", self.DEFAULT_RERANK_MODEL),
            "kg_model": os.getenv("KG_MODEL", self.DEFAULT_KG_MODEL)
        }
    
    @property
    def llm_model(self) -> str:
        """获取LLM模型名称"""
        return self._config.get("llm_model", self.DEFAULT_LLM_MODEL)
    
    @property
    def embedding_model(self) -> str:
        """获取Embedding模型名称"""
        return self._config.get("embedding_model", self.DEFAULT_EMBEDDING_MODEL)
    
    @property
    def rerank_model(self) -> str:
        """获取Rerank模型名称"""
        return self._config.get("rerank_model", self.DEFAULT_RERANK_MODEL)
    
    @property
    def kg_model(self) -> str:
        """获取知识图谱模型名称"""
        return self._config.get("kg_model", self.DEFAULT_KG_MODEL)
    
    def get_config(self) -> dict:
        """获取完整配置"""
        return self._config.copy()

# Model config
_model_config: Optional[ModelConfig] = None

def get_model_config(config_path: Optional[str] = None) -> ModelConfig:
    """
    获取全局模型配置实例
    
    Args:
        config_path: 配置文件路径
        
    Returns:
        ModelConfig实例
    """
    global _model_config
    if _model_config is None:
        _model_config = ModelConfig(config_path)
    return _model_config