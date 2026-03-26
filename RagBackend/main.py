from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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


# 配置日志
logging.basicConfig(level=logging.INFO)
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

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 在生产环境中应限制具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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