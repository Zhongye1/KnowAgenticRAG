# 文档预览转换镜像：LibreOffice headless + qpdf + 中文字体（D55 §3E）。
#
# 两个容易翻车的点，镜像层就解决掉：
#   1. **中文字体**：不装 fonts-noto-cjk，soffice 转出来的中文全是方格；
#   2. **qpdf**：转换产物默认不线性化，而 PDF.js 对非线性 PDF 必须先取文件尾部的
#      xref 才能渲染首页；线性化后首页所需对象在文件头部，大文档首屏体感差别明显。
FROM python:3.12-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    HOME=/tmp

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libreoffice-writer \
        libreoffice-calc \
        libreoffice-impress \
        qpdf \
        fonts-noto-cjk \
        fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN pip install --no-cache-dir 'fastapi>=0.115' 'uvicorn>=0.30'

COPY app/ /app/

# 非 root 运行；rootfs 只读由 compose 保证，可写处只有 /tmp
RUN useradd --create-home --shell /usr/sbin/nologin converter \
    && chown -R converter:converter /app
USER converter

EXPOSE 5030
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5030", "--workers", "1"]
