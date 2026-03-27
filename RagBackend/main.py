from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import uuid
import json
import logging
from pydantic import BaseModel

import os
import sys

# 添加项目根目录到Python路径
project_root = Path(__file__).resolve().parent
sys.path.append(str(project_root))


# 配置结构化日志（每条日志携带 trace_id，全链路可追溯）
from trace_logging import setup_trace_logging, TraceMiddleware
setup_trace_logging()
logger = logging.getLogger(__name__)

# 初始化FastAPI应用
app = FastAPI(title="RAG Backend Service", version="1.0")


# ── MySQL 延迟初始化 ──────────────────────────────────────────
# 原来在 LogonAndLogin.py 模块级直接调用 create_user_table()，
# 若 MySQL 未启动则整个后端启动失败。
# 修复：移到 startup 事件，连接失败只记录警告，不阻断启动。
@app.on_event("startup")
async def _init_db_tables():
    """应用启动后尝试初始化 MySQL 表，连接失败只警告不崩溃"""
    try:
        from RAGF_User_Management.LogonAndLogin import ensure_tables_exist
        ensure_tables_exist()
        logger.info("MySQL 数据表初始化完成")
    except Exception as e:
        logger.warning(
            f"MySQL 数据表初始化失败（MySQL 可能未启动）: {e}\n"
            "用户相关功能暂不可用，其他服务正常运行。"
        )
    # 初始化本地 SQLite 辅助表
    try:
        from audit.audit_log import ensure_audit_table
        from open_api.api_key_manager import ensure_apikey_table
        from data_sources.datasource_manager import ensure_datasource_table
        ensure_audit_table()
        ensure_apikey_table()
        ensure_datasource_table()
        logger.info("本地辅助数据表初始化完成（审计日志/API Key/数据源）")
    except Exception as e:
        logger.warning(f"本地辅助表初始化失败: {e}")

    # 注册向量化任务处理函数（必须在 Worker 启动前完成注册）
    try:
        from document_processing.vectorize_task import register_all
        register_all()
        logger.info("向量化任务处理函数注册完成")
    except Exception as e:
        logger.warning(f"向量化任务注册失败: {e}")

    # 启动异步向量化任务队列 Worker（优先 Redis Stream，降级内存队列）
    try:
        from document_processing.task_queue import ensure_worker_started
        await ensure_worker_started()
        logger.info("向量化任务队列 Worker 已启动（Redis Stream / 内存降级，最大并发: 2）")
    except Exception as e:
        logger.warning(f"任务队列 Worker 启动失败: {e}")

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 在生产环境中应限制具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# TraceID 中间件（在 CORS 之后注册，每请求注入唯一 trace_id）
app.add_middleware(TraceMiddleware)

# 审计日志中间件（在 CORS 之后注册，确保所有 API 调用均被记录）
try:
    from audit.audit_log import AuditMiddleware
    app.add_middleware(AuditMiddleware)
    logger.info("审计日志中间件已挂载")
except Exception as _e:
    logger.warning(f"审计日志中间件挂载失败: {_e}")

# 异步任务队列（暂未启用，保留扩展入口）
# 如需启用 Celery，安装 celery[redis] 并取消注释以下代码：
# from celery import Celery
# celery = Celery('tasks', broker='redis://localhost:6379/0', backend='redis://localhost:6379/0')

# 请求模型
class QueryRequest(BaseModel):
    question: str



# 导入文档处理模块
from document_processing.doc_manage import router as doc_manage  # 导入文件处理服务接口
from document_processing.doc_upload import router as upload_models # 导入文件上传服务接口
from document_processing.doc_list import router as doc_list # 导入文件列表服务接口

from knowledge_base.knowledgeBASE4CURD import router as knowledge_CURD # 导入知识库CURD接口
from knowledge_base.knowledgebase_cover import router as pic_cover_manage # 导入封面图床管理接口
#ollama模型列表接口
from ollama_management.ollama_sRCP import router as get_ollama_models
#RAG服务
from RAG_M.RAG_app import router as rag_service
#对话管理
from chat_units.chat_management.chat_main import router as chat_manager_router

# 导入知识库图数据模块
from knowledge_graph.generate_kg import router as kg_graph
#
from RAGF_User_Management.LogonAndLogin import router as login_router
from RAGF_User_Management.User_Management import router as user_management_router

#用户设置页面
from RAGF_User_Management.User_settings import router as user_settings_router
# QQ 登录
from RAGF_User_Management.QQ_Login import router as qq_login_router
# 密码重置
from RAGF_User_Management.Reset_Password import router as reset_password_router

# ── 新增模块导入 ──────────────────────────────────────────────
from multi_model.model_router import router as model_router
from audit.audit_log import router as audit_router, ensure_audit_table, AuditMiddleware
from open_api.api_key_manager import router as apikey_router, ensure_apikey_table
from data_sources.datasource_manager import router as datasource_router, ensure_datasource_table
# 增量向量化
from document_processing.incremental_vectorizer import router as incremental_vectorize_router
# Agent 联网搜索
from agent_tools.web_search_tool import api_router as web_search_router
# 多模态语音识别（Whisper）
try:
    from multimodal.whisper_asr import router as whisper_router
    _whisper_available = True
except ImportError as _e:
    logger.warning(f"Whisper 模块导入失败（openai-whisper 未安装？）: {_e}")
    _whisper_available = False
# 用户反馈
from feedback.feedback_router import router as feedback_router
# 办公生态联动（Obsidian + 飞书）
try:
    from integrations.obsidian_sync import router as obsidian_router
    from integrations.feishu_bot import router as feishu_router
    _integrations_available = True
except ImportError as _e:
    logger.warning(f"集成模块导入失败: {_e}")
    _integrations_available = False

app.include_router(knowledge_CURD, tags=["知识库CURD接口"])  # 知识库CURD接口
app.include_router(doc_manage, tags=["文件处理服务接口"])  # 文件管理接口
app.include_router(upload_models, tags=["文档上传服务接口"]) #文件上传接口
app.include_router(pic_cover_manage, tags=["封面图床管理"])#封面图床管理
app.include_router(get_ollama_models, tags=["OLLAMA模型列表获取接口"])  # Ollama模型列表接口
#聊天服务
app.include_router(chat_manager_router, prefix="/api/chat", tags=["对话管理服务接口"])
# RAG服务接口
app.include_router(rag_service, prefix="/api/RAG", tags=["RAG 服务接口"])
# 知识图谱接口
app.include_router(kg_graph, prefix="/api/kg", tags=["知识图谱接口"])

# 用户管理接口（旧版，路由前缀隔离，避免与 user_settings_router 冲突）
app.include_router(login_router, tags=["用户登录和注册接口"])
app.include_router(user_management_router, prefix="/api/legacy/user", tags=["用户管理接口(旧版)"])

#用户设置接口
app.include_router(user_settings_router, tags=["用户设置接口"])
# QQ 登录接口
app.include_router(qq_login_router, tags=["QQ OAuth2.0 登录"])
# 密码重置接口
app.include_router(reset_password_router, tags=["密码重置"])

#
app.include_router(doc_list, prefix="/api/files",tags=["文件列表服务接口"])  # 文档列表接口

# ── 新增路由注册 ──────────────────────────────────────────────
app.include_router(model_router, tags=["多模型适配接口"])
app.include_router(audit_router, tags=["审计日志接口"])
app.include_router(apikey_router, tags=["开放API-Key管理"])
app.include_router(datasource_router, tags=["多数据源接入"])
app.include_router(incremental_vectorize_router, tags=["增量向量化"])
app.include_router(web_search_router, tags=["Agent联网搜索"])
app.include_router(feedback_router, tags=["用户反馈"])
if _whisper_available:
    app.include_router(whisper_router, tags=["多模态-语音识别(Whisper)"])
if _integrations_available:
    app.include_router(obsidian_router, tags=["办公联动-Obsidian同步"])
    app.include_router(feishu_router, tags=["办公联动-飞书机器人"])

# ── 8大升级模块路由注册 ───────────────────────────────────────
# 知识库管理升级
try:
    from knowledge.ocr_parser import router as ocr_router
    from knowledge.doc_version_manager import router as doc_version_router
    from knowledge.doc_tag_manager import router as doc_tag_router
    from knowledge.rbac_manager import router as rbac_router
    from knowledge.doc_comment_manager import router as doc_comment_router
    app.include_router(ocr_router, tags=["知识库-OCR解析"])
    app.include_router(doc_version_router, tags=["知识库-文档版本管理"])
    app.include_router(doc_tag_router, tags=["知识库-标签与归档"])
    app.include_router(rbac_router, tags=["知识库-角色权限管控"])
    app.include_router(doc_comment_router, tags=["知识库-文档评论区"])
    logger.info("知识库升级模块已加载")
except Exception as _e:
    logger.warning(f"知识库升级模块加载失败: {_e}")

# RAG 增强
try:
    from rag_enhancement.rag_evaluator import router as rag_eval_router
    from rag_enhancement.conversation_memory import router as conv_memory_router
    from rag_enhancement.retrieval_visualizer import router as retrieval_viz_router
    app.include_router(rag_eval_router, tags=["RAG-效果评估与调优"])
    app.include_router(conv_memory_router, tags=["RAG-对话记忆持久化"])
    app.include_router(retrieval_viz_router, tags=["RAG-检索可视化与纠错"])
    logger.info("RAG增强模块已加载")
except Exception as _e:
    logger.warning(f"RAG增强模块加载失败: {_e}")

# Agent 企业工具链
try:
    from agent_tools.agent_advanced import router as agent_advanced_router
    app.include_router(agent_advanced_router, tags=["Agent-企业工具链与插件市场"])
    logger.info("Agent企业工具链已加载")
except Exception as _e:
    logger.warning(f"Agent企业工具链加载失败: {_e}")

# 多模型扩展
try:
    from multi_model.extended_model_router import router as ext_model_router
    app.include_router(ext_model_router, tags=["多模型-百炼/星火/负载均衡/统计"])
    logger.info("扩展多模型路由已加载")
except Exception as _e:
    logger.warning(f"扩展多模型路由加载失败: {_e}")

# 企业合规
try:
    from enterprise.compliance_manager import router as compliance_router
    app.include_router(compliance_router, tags=["企业合规-SSO/多租户/限流/脱敏"])
    logger.info("企业合规模块已加载")
except Exception as _e:
    logger.warning(f"企业合规模块加载失败: {_e}")

# 生态整合
try:
    from integrations.dingtalk_wecom import router as dingtalk_wecom_router
    app.include_router(dingtalk_wecom_router, tags=["生态-钉钉/企微/WPS集成"])
    logger.info("钉钉/企微集成已加载")
except Exception as _e:
    logger.warning(f"钉钉/企微集成加载失败: {_e}")

# 全文检索
try:
    from search.fulltext_search import router as fulltext_router
    app.include_router(fulltext_router, tags=["全文检索-FTS5跨库搜索"])
    logger.info("全文检索模块已加载")
except Exception as _e:
    logger.warning(f"全文检索模块加载失败: {_e}")

# 商业化
try:
    from billing.billing_manager import router as billing_router
    app.include_router(billing_router, tags=["商业化-定价/订阅/工单系统"])
    logger.info("商业化模块已加载")
except Exception as _e:
    logger.warning(f"商业化模块加载失败: {_e}")

# 用户自定义模型配置
try:
    from models.user_model_config import router as user_model_config_router
    app.include_router(user_model_config_router, tags=["用户模型配置"])
    logger.info("用户模型配置模块已加载")
except Exception as _e:
    logger.warning(f"用户模型配置模块加载失败: {_e}")

# 轻量模型评测面板（LangChain Evaluation 风格，ECharts 数据）
try:
    from evaluation.eval_panel import router as eval_router
    app.include_router(eval_router, tags=["模型评测面板"])
    logger.info("模型评测面板已加载")
except Exception as _e:
    logger.warning(f"模型评测面板加载失败: {_e}")

# 语义分块 API（RecursiveCharacter + INT8量化）
try:
    from document_processing.semantic_splitter import split_router
    if split_router:
        app.include_router(split_router, tags=["语义分块-预览与向量化"])
        logger.info("语义分块模块已加载")
except Exception as _e:
    logger.warning(f"语义分块模块加载失败: {_e}")

# cross-encoder 重排序
try:
    from rag_enhancement.reranker import router as reranker_router
    app.include_router(reranker_router, tags=["RAG-cross-encoder重排"])
    logger.info("cross-encoder重排模块已加载")
except Exception as _e:
    logger.warning(f"cross-encoder重排模块加载失败: {_e}")

# 文档创作模块
try:
    from creation.doc_creation import router as creation_router
    app.include_router(creation_router, tags=["文档创作-摘要/翻译/大纲/优化"])
    logger.info("文档创作模块已加载")
except Exception as _e:
    logger.warning(f"文档创作模块加载失败: {_e}")

# 系统监控（Prometheus 指标暴露）
try:
    from monitoring.metrics import router as metrics_router, instrument_app
    instrument_app(app)
    app.include_router(metrics_router, tags=["系统监控-Prometheus指标"])
    logger.info("系统监控模块已加载")
except Exception as _e:
    logger.warning(f"系统监控模块加载失败: {_e}")

# 知识库备份
try:
    from enterprise.kb_backup import router as backup_router
    app.include_router(backup_router, tags=["知识库备份-Markdown/ZIP"])
    logger.info("知识库备份模块已加载")
except Exception as _e:
    logger.warning(f"知识库备份模块加载失败: {_e}")

# ── 知识广场路由 ──────────────────────────────────────────────
try:
    from square import square_router
    app.include_router(square_router, tags=["知识广场-分享/圈子/搜索"])
    logger.info("知识广场模块已加载")
except Exception as _e:
    logger.warning(f"知识广场模块加载失败: {_e}")

# 添加静态文件服务
# 将图片存储目录映射到/static URL路径
app.mount("/static", StaticFiles(directory="local-KLB-files"), name="static")

# 为封面图片专门配置一个路径
cover_path = Path(__file__).parent / "knowledge_base" / "uploaded_pics" / "covers"
cover_path.mkdir(parents=True, exist_ok=True)
app.mount("/static/covers", StaticFiles(directory=str(cover_path)), name="covers")

# 为用户头像配置路径
avatar_path = Path(__file__).parent / "user_avatars"
avatar_path.mkdir(parents=True, exist_ok=True)
app.mount("/static/avatars", StaticFiles(directory=str(avatar_path)), name="avatars")


# API路由
#@app.post("/query")
#async def handle_query(request: QueryRequest, file: UploadFile = File(None)):
#    """处理查询请求，支持文本查询和文件上传查询"""
#    try:
#        if file:
            # 处理带文件的查询请求
#            task_id = str(uuid.uuid4())
#            logger.info(f"开始处理文件查询任务，任务ID: {task_id}")
            # 读取文件内容
#            file_content = await file.read()
            # 发送Celery任务
#            task = celery.send_task(
#                'process_document',
#                args=[file_content, request.question, file.filename],
#                task_id=task_id
#            )
#            return {"task_id": task.id, "status": "processing"}
#        else:
            # 处理纯文本查询
#            logger.info(f"处理文本查询: {request.question}")
            # 直接调用LLM获取答案
#            from llm_engine import LLMEngine
#            llm_engine = LLMEngine()
#            answer = llm_engine.direct_answer(request.question)
#            return {"answer": answer}
#    except Exception as e:
#        logger.error(f"查询处理失败: {str(e)}")
#        raise HTTPException(status_code=500, detail=f"查询处理失败: {str(e)}")

#@app.get("/result/{task_id}")
#def get_result(task_id: str):
#    """获取异步任务结果"""
#    try:
#        result = celery.AsyncResult(task_id)
#        if result.ready():
#            return {
#                "status": result.status,
#                "result": result.get()
#            }
#        else:
#            return {
#                "status": result.status,
#                "result": None
#            }
#    except Exception as e:
#        logger.error(f"获取任务结果失败: {str(e)}")
#        raise HTTPException(status_code=500, detail=f"获取任务结果失败: {str(e)}")

@app.get("/helloworld/", response_model=dict)
async def hello_world():
    """
    测试端点
    """
    return {"message": "Hello World-格林尼治-秋明-共青城-武汉-环日第七迭代-我看见神在近地轨道上完整-3902-2321-2421-3821"}

@app.get("/")
async def health_check():
    """健康检查接口"""
    return {"status": "healthy", "service": "RAG Backend Service", "version": "1.0"}


@app.get("/download", response_class=HTMLResponse)
async def app_download_page():
    """App 下载页面 - 提供 Android APK 和 iOS TestFlight 下载"""
    html = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>KnowledgeRAG App 下载</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:linear-gradient(135deg,#1e3a8a 0%,#3b82f6 50%,#8b5cf6 100%);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
  .card{background:#fff;border-radius:24px;padding:48px 40px;max-width:460px;width:100%;text-align:center;box-shadow:0 40px 100px rgba(0,0,0,.25)}
  .logo{width:80px;height:80px;border-radius:20px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:36px}
  h1{font-size:26px;font-weight:800;color:#1f2937;margin-bottom:8px}
  .subtitle{font-size:15px;color:#6b7280;margin-bottom:36px;line-height:1.6}
  .btn{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;padding:16px 24px;border-radius:14px;font-size:16px;font-weight:600;cursor:pointer;text-decoration:none;margin-bottom:12px;border:none;transition:all .2s}
  .btn-android{background:linear-gradient(135deg,#16a34a,#15803d);color:#fff}
  .btn-android:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(22,163,74,.4)}
  .btn-ios{background:linear-gradient(135deg,#1f2937,#374151);color:#fff}
  .btn-ios:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(31,41,55,.4)}
  .btn-source{background:#f3f4f6;color:#374151;border:1px solid #e5e7eb}
  .btn-source:hover{background:#e5e7eb}
  .btn svg{width:22px;height:22px;flex-shrink:0}
  .divider{display:flex;align-items:center;gap:12px;margin:20px 0;color:#9ca3af;font-size:13px}
  .divider::before,.divider::after{content:'';flex:1;height:1px;background:#e5e7eb}
  .features{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:32px}
  .feature{background:#f8fafc;border-radius:10px;padding:12px;text-align:left}
  .feature-icon{font-size:20px;margin-bottom:4px}
  .feature-title{font-size:13px;font-weight:600;color:#374151}
  .feature-desc{font-size:11px;color:#9ca3af;margin-top:2px}
  .version-badge{display:inline-block;background:#eff6ff;color:#3b82f6;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600;margin-bottom:24px}
  footer{margin-top:28px;font-size:12px;color:#9ca3af}
  footer a{color:#3b82f6;text-decoration:none}
  @media(max-width:480px){.card{padding:32px 24px}.features{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="card">
  <div class="logo">🧠</div>
  <h1>KnowledgeRAG</h1>
  <p class="subtitle">智能知识管理 · AI 驱动检索<br/>随时随地，掌握你的知识库</p>
  <div class="version-badge">v1.0.0 最新版</div>

  <div class="features">
    <div class="feature">
      <div class="feature-icon">📚</div>
      <div class="feature-title">知识库管理</div>
      <div class="feature-desc">创建、上传、管理文档</div>
    </div>
    <div class="feature">
      <div class="feature-icon">🤖</div>
      <div class="feature-title">AI 智能问答</div>
      <div class="feature-desc">RAG 精准语义检索</div>
    </div>
    <div class="feature">
      <div class="feature-icon">🌐</div>
      <div class="feature-title">知识广场</div>
      <div class="feature-desc">分享、发现优质知识库</div>
    </div>
    <div class="feature">
      <div class="feature-icon">⚡</div>
      <div class="feature-title">Agent 任务</div>
      <div class="feature-desc">自动化多步骤任务</div>
    </div>
  </div>

  <a class="btn btn-android"
     href="https://github.com/March030303/KnowledgeRAG-GZHU/releases/latest/download/KnowledgeRAG.apk"
     onclick="this.textContent='⏳ 准备下载...'">
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.523 15.34L6.477 15.34 5 13.21 12 2l7 11.21-1.477 2.13zm-9.038 1.32H15.515L14.5 18.5h-5L8.485 16.66zm.515 3.34L9 22h6l1-2H9z"/></svg>
    Android APK 下载
  </a>

  <a class="btn btn-ios"
     href="https://testflight.apple.com/join/placeholder"
     target="_blank">
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
    iOS TestFlight 下载
  </a>

  <div class="divider">或者</div>

  <a class="btn btn-source"
     href="https://github.com/March030303/KnowledgeRAG-GZHU"
     target="_blank">
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
    查看源码 / 自行编译
  </a>

  <footer>
    <p>KnowledgeRAG-GZHU · 开源免费 ·
      <a href="https://github.com/March030303/KnowledgeRAG-GZHU/releases" target="_blank">更新日志</a>
    </p>
    <p style="margin-top:6px">需要帮助？<a href="mailto:support@rag-gzhu.com">联系我们</a></p>
  </footer>
</div>
</body>
</html>"""
    return HTMLResponse(content=html)

# 错误处理
@app.exception_handler(Exception)

async def general_exception_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content=json.dumps({"detail": f"服务器内部错误: {str(exc)}"})
    )


#启动应用
if __name__ == "__main__":
    import uvicorn
    import sys
    import threading
    
    # 检查是否以打包形式运行
    if getattr(sys, 'frozen', False):
        try:
            from PyQt5.QtWidgets import QApplication, QSystemTrayIcon, QMenu, QMessageBox
            from PyQt5.QtGui import QIcon
            from PyQt5.QtCore import QTimer
            import os
            
            # 在单独的线程中运行FastAPI服务
            def run_server():
                uvicorn.run(app, host="0.0.0.0", port=8000)
            
            server_thread = threading.Thread(target=run_server, daemon=True)
            server_thread.start()
            
            # 启动系统托盘图标
            app_gui = QApplication(sys.argv)
            
            # 创建系统托盘图标
            tray_icon = QSystemTrayIcon()
            tray_icon.setIcon(QIcon("assets/icon.ico"))  # 使用项目图标
            
            # 创建右键菜单
            menu = QMenu()
            exit_action = menu.addAction("退出")
            exit_action.triggered.connect(lambda: os._exit(0))
            
            show_action = menu.addAction("服务信息")
            show_action.triggered.connect(lambda: QMessageBox.information(
                None, 
                "服务信息", 
                "ASF-RAG 后端服务正在运行\n访问地址: http://localhost:8000\n\n点击托盘图标可查看菜单"
            ))
            
            tray_icon.setContextMenu(menu)
            tray_icon.show()
            tray_icon.showMessage(
                "ASF-RAG 后端服务",
                "服务已启动，访问地址: http://localhost:8000",
                QSystemTrayIcon.Information,
                3000
            )
            
            sys.exit(app_gui.exec_())
        except ImportError:
            # 如果没有PyQt5，则在控制台显示信息并保持运行
            print("ASF-RAG 后端服务正在运行...")
            print("访问地址: http://localhost:8000")
            print("按 Ctrl+C 退出服务")
            try:
                uvicorn.run(app, host="0.0.0.0", port=8000)
            except KeyboardInterrupt:
                print("服务已停止")
    else:
        # 开发环境下直接运行
        uvicorn.run(app, host="0.0.0.0", port=8000)

#pyinstaller --onefile --noconsole --add-data 
# "local-KLB-files;local-KLB-files" --add-data "assets;assets" 
# --add-data "chat_units;chat_units" 
# --add-data "document_processing;document_processing" 
# --add-data "knowledge_base;knowledge_base" 
# --add-data "knowledge_graph;knowledge_graph" --add-data "RAG_M;RAG_M" 
# --add-data "user_avatars;user_avatars" --add-data "metadata;metadata" main.py