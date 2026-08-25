# 背景：
面向 RAG 向量库的文档解析，目标是输出「高保真、可结构感知、带元数据」的中间表示，再交给分块与嵌入。
解析质量直接决定检索上限，所以这里要减少表格行列被破坏、丢失标题层级以及乱序阅读。

文档解析主要处理的问题有格式支持（PDF，Office，HTML/MD，图像，图表/公式）、结构保持、错误恢复等
业务上需要设计一个多阶段、多模态并发的智能处理管线，设计目标还应该包括实现布局感知解析和深度文档理解的能力

解析质量的三个维度主要有：
- 准确性：文字、表格、公式是否正确提取
- 完整性：是否保留了所有重要信息（标题、列表、引用）
- 结构化：是否保留了文档的层次结构（章节、段落）

# 设计方案：

布局感知 + 深度理解能力相关的设计考虑主要有：

    版面分析（标题 / 段落 / 表格 / 图片 / 公式区域）
    阅读顺序恢复（多栏、跨页）
    表格结构识别（合并单元格、跨页表）
    公式转 LaTeX
    图表生成文字描述（VLM 辅助）
    输出带层级的 Markdown / JSON / DocTags，附 bbox、页码、类型元数据

工程落地的话主要实践一套轻量/混合策略：

    简单数字 PDF / 纯文本 Office → PyMuPDF / pdfplumber / python-docx（极快）
    复杂 PDF / 扫描件 / 学术 → Docling 或 MinerU
    多格式 + 需要统一元素模型 → Unstructured hi_res
    表格极致要求 → MinerU / Reducto / 专用表格模型
    公式密集 → MinerU / Mathpix / Nougat 类
    图像/图表 → 解析后走 VLM 描述，或 ColPali 等多模态检索

当前计划落地架构：

    原始文件
    → 格式路由（PDF / Office / HTML / MD / Image / 扫描件 -> 确定文件类型来决定走哪一条解析路径）
    → 文档加载器（解析引擎）
        PDFLoader（Docling 默认 + MinerU 复杂页兜底）
        OfficeLoader（DOCX/PPTX/XLSX → 统一中间表示）
        HTML/MDLoader
        ImageLoader（OCR + VLM 描述）
    
    → 清洗（去页眉页脚、页码、水印、重复版权声明、乱码等噪声进行过滤）

    → Document Splitter / Hierarchical Chunker（文档分割器）
        输入：StructuredDocument
        策略：Layout-aware / Hierarchical / Semantic Hybrid
        按章节、表格、列表、公式边界切，而不是固定 token 
        输出：List[Chunk]（text + metadata + hierarchy path）

    → Embedding + 元数据入库（向量库）

