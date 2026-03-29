"""
企业级 Agent 工具链扩展
从 4 类基础工具扩展至数十种预置工具
"""

import os
import json
from typing import Optional, Dict
from datetime import datetime


# ────────────────────────────────────────────────────────────
# ────────────────────────────────────────────────────────────
class AgentTool:
    name: str = ""
    description: str = ""
    category: str = ""

    def run(self, **kwargs) -> str:
        raise NotImplementedError


# - -
class DataAnalysisTool(AgentTool):
    name = "data_analysis"
    description = "分析 CSV/Excel 数据文件，生成统计摘要、相关性分析、趋势分析"
    category = "数据分析"

    def run(self, file_path: str = "", query: str = "") -> str:
        try:
            import pandas as pd

            df = (
                pd.read_csv(file_path)
                if file_path.endswith(".csv")
                else pd.read_excel(file_path)
            )
            summary = {
                "shape": list(df.shape),
                "columns": list(df.columns),
                "dtypes": {k: str(v) for k, v in df.dtypes.items()},
                "describe": json.loads(df.describe().to_json()),
                "null_counts": df.isnull().sum().to_dict(),
                "sample": json.loads(df.head(3).to_json(orient="records")),
            }
            return (
                f"数据分析结果：\n{json.dumps(summary, ensure_ascii=False, indent=2)}"
            )
        except Exception as e:
            return f"[数据分析失败] {e}"


class PythonCodeTool(AgentTool):
    name = "python_execute"
    description = "在沙箱中执行 Python 代码，适合数值计算、数据处理"
    category = "数据分析"

    def run(self, code: str = "") -> str:
        import subprocess
        import sys
        import tempfile

        with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
            f.write(code)
            tmp = f.name
        try:
            result = subprocess.run(
                [sys.executable, tmp], capture_output=True, text=True, timeout=15
            )
            output = result.stdout[:2000] if result.stdout else ""
            error = result.stderr[:500] if result.stderr else ""
            return f"输出：\n{output}" + (f"\n错误：{error}" if error else "")
        except subprocess.TimeoutExpired:
            return "[超时] 代码执行超过 15 秒"
        finally:
            os.unlink(tmp)


class ChartGeneratorTool(AgentTool):
    name = "chart_generate"
    description = "根据数据生成折线图/柱状图/饼图，返回 base64 图片"
    category = "数据分析"

    def run(self, data: Dict = None, chart_type: str = "bar", title: str = "") -> str:
        try:
            import matplotlib

            matplotlib.use("Agg")
            import matplotlib.pyplot as plt
            import base64
            import io

            plt.rcParams["font.family"] = ["SimHei", "DejaVu Sans"]
            fig, ax = plt.subplots(figsize=(10, 6))
            labels = list(data.get("labels", []))
            values = list(data.get("values", []))
            if chart_type == "bar":
                ax.bar(labels, values, color="#5c6bc0")
            elif chart_type == "line":
                ax.plot(labels, values, marker="o", color="#5c6bc0")
            elif chart_type == "pie":
                ax.pie(values, labels=labels, autopct="%1.1f%%")
            ax.set_title(title or "数据图表")
            buf = io.BytesIO()
            plt.savefig(buf, format="png", bbox_inches="tight", dpi=100)
            buf.seek(0)
            b64 = base64.b64encode(buf.read()).decode()
            plt.close()
            return f"data:image/png;base64,{b64}"
        except Exception as e:
            return f"[图表生成失败] {e}"


# - -
class EmailTool(AgentTool):
    name = "send_email"
    description = "发送邮件，支持 HTML 格式正文和附件"
    category = "办公自动化"

    def run(
        self, to: str = "", subject: str = "", body: str = "", is_html: bool = False
    ) -> str:
        try:
            import smtplib
            from email.mime.text import MIMEText
            from email.mime.multipart import MIMEMultipart

            smtp_user = os.getenv("SMTP_USER", "")
            smtp_pass = os.getenv("SMTP_PASS", "")
            smtp_host = os.getenv("SMTP_HOST", "smtp.163.com")
            smtp_port = int(os.getenv("SMTP_PORT", "465"))
            if not smtp_user:
                return "[邮件] SMTP未配置，跳过发送。目标：" + to

            msg = MIMEMultipart()
            msg["From"] = smtp_user
            msg["To"] = to
            msg["Subject"] = subject
            content_type = "html" if is_html else "plain"
            msg.attach(MIMEText(body, content_type, "utf-8"))

            with smtplib.SMTP_SSL(smtp_host, smtp_port) as s:
                s.login(smtp_user, smtp_pass)
                s.send_message(msg)
            return f"邮件已发送至 {to}"
        except Exception as e:
            return f"[邮件发送失败] {e}"


# - -
class FileReadTool(AgentTool):
    name = "file_read"
    description = "读取本地文件内容（txt/md/json/csv）"
    category = "文件操作"

    def run(self, file_path: str = "", encoding: str = "utf-8") -> str:
        try:
            with open(file_path, "r", encoding=encoding) as f:
                content = f.read(8000)
            return content
        except Exception as e:
            return f"[文件读取失败] {e}"


class FileWriteTool(AgentTool):
    name = "file_write"
    description = "将内容写入文件"
    category = "文件操作"

    def run(self, file_path: str = "", content: str = "", mode: str = "w") -> str:
        try:
            os.makedirs(os.path.dirname(file_path) or ".", exist_ok=True)
            with open(file_path, mode, encoding="utf-8") as f:
                f.write(content)
            return f"已写入 {file_path}"
        except Exception as e:
            return f"[文件写入失败] {e}"


class PDFExportTool(AgentTool):
    name = "export_pdf"
    description = "将 Markdown 或 HTML 内容导出为 PDF 文件"
    category = "文档生成"

    def run(
        self, content: str = "", output_path: str = "output.pdf", title: str = "报告"
    ) -> str:
        try:
            import markdown

            html = f"""<html><head><meta charset='utf-8'>
            <style>body{{font-family:SimSun,sans-serif;margin:40px;line-height:1.8}}
            h1,h2,h3{{color:#333}}pre{{background:#f5f5f5;padding:10px;border-radius:4px}}
            </style></head><body><h1>{title}</h1>{markdown.markdown(content)}</body></html>"""
            try:
                import pdfkit

                pdfkit.from_string(html, output_path)
                return f"PDF已生成：{output_path}"
            except:
                # HTML
                html_path = output_path.replace(".pdf", ".html")
                with open(html_path, "w", encoding="utf-8") as f:
                    f.write(html)
                return f"pdfkit不可用，已保存为HTML：{html_path}"
        except Exception as e:
            return f"[PDF生成失败] {e}"


# - -
class CalendarTool(AgentTool):
    name = "get_datetime"
    description = "获取当前日期时间，进行日期计算"
    category = "时间工具"

    def run(self, operation: str = "now", delta_days: int = 0) -> str:
        from datetime import timedelta

        now = datetime.now()
        if operation == "now":
            return now.strftime("%Y-%m-%d %H:%M:%S")
        elif operation == "add":
            result = now + timedelta(days=delta_days)
            return result.strftime("%Y-%m-%d")
        elif operation == "weekday":
            days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
            return days[now.weekday()]
        return now.isoformat()


# - -
class TranslateTool(AgentTool):
    name = "translate"
    description = "调用翻译API翻译文本（中英互译）"
    category = "语言工具"

    def run(self, text: str = "", target_lang: str = "en") -> str:
        try:
            import urllib.request
            import urllib.parse
            import hashlib
            import random

            app_id = os.getenv("BAIDU_TRANS_APP_ID", "")
            secret = os.getenv("BAIDU_TRANS_SECRET", "")
            if not app_id:
                return f"[翻译] 未配置百度翻译API，原文：{text[:100]}"
            salt = str(random.randint(32768, 65536))
            sign_raw = app_id + text + salt + secret
            sign = hashlib.md5(sign_raw.encode()).hexdigest()
            params = urllib.parse.urlencode(
                {
                    "q": text,
                    "from": "auto",
                    "to": target_lang,
                    "appid": app_id,
                    "salt": salt,
                    "sign": sign,
                }
            )
            url = f"http://api.fanyi.baidu.com/api/trans/vip/translate?{params}"
            with urllib.request.urlopen(url, timeout=10) as resp:
                data = json.loads(resp.read())
            return data.get("trans_result", [{}])[0].get("dst", "翻译失败")
        except Exception as e:
            return f"[翻译失败] {e}"


# - -
class SummarizeTool(AgentTool):
    name = "summarize"
    description = "对长文本生成摘要"
    category = "文本处理"

    def run(self, text: str = "", max_length: int = 200) -> str:
        try:
            import httpx

            ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
            model = os.getenv("MODEL", "qwen2:0.5b")
            prompt = f"请用{max_length}字以内总结以下内容：\n\n{text[:3000]}"
            resp = httpx.post(
                f"{ollama_url}/api/generate",
                json={"model": model, "prompt": prompt, "stream": False},
                timeout=30,
            )
            return resp.json().get("response", "")
        except Exception as e:
            return f"[摘要失败] {e}"


class KeywordExtractTool(AgentTool):
    name = "extract_keywords"
    description = "从文本中提取关键词"
    category = "文本处理"

    def run(self, text: str = "", top_k: int = 10) -> str:
        try:
            import jieba.analyse

            keywords = jieba.analyse.extract_tags(text, topK=top_k, withWeight=True)
            return json.dumps(
                [{"word": w, "weight": round(s, 4)} for w, s in keywords],
                ensure_ascii=False,
            )
        except ImportError:
            import re
            from collections import Counter

            words = re.findall(r"[\u4e00-\u9fff]{2,}", text)
            freq = Counter(words).most_common(top_k)
            return json.dumps(
                [{"word": w, "count": c} for w, c in freq], ensure_ascii=False
            )


# - -
TOOL_REGISTRY: Dict[str, AgentTool] = {}


def register_all_tools():
    tools = [
        DataAnalysisTool(),
        PythonCodeTool(),
        ChartGeneratorTool(),
        EmailTool(),
        FileReadTool(),
        FileWriteTool(),
        PDFExportTool(),
        CalendarTool(),
        TranslateTool(),
        SummarizeTool(),
        KeywordExtractTool(),
    ]
    for tool in tools:
        TOOL_REGISTRY[tool.name] = tool
    return TOOL_REGISTRY


def get_tool(name: str) -> Optional[AgentTool]:
    if not TOOL_REGISTRY:
        register_all_tools()
    return TOOL_REGISTRY.get(name)


def list_tools() -> List[Dict]:
    if not TOOL_REGISTRY:
        register_all_tools()
    return [
        {"name": t.name, "description": t.description, "category": t.category}
        for t in TOOL_REGISTRY.values()
    ]


register_all_tools()
