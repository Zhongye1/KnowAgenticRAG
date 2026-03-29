import logging
import tempfile
import os
from pdfplumber import PDFPlumber
import pytesseract
from PIL import Image
import layoutparser as lp
import camelot
from pdf2image import convert_from_bytes
from typing import Dict, List, Any

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class DocumentPipeline:
    def __init__(self):
        # Initialize
        try:
            self.layout_model = lp.Detectron2LayoutModel(
                "lp://PubLayNet/mask_rcnn_X_101_32x8d_FPN_3x/config",
                extra_config=["MODEL.ROI_HEADS.SCORE_THRESH_TEST", 0.8],
            )
            logger.info("布局分析模型初始化成功")
        except Exception as e:
            logger.warning(f"布局分析模型初始化失败: {str(e)}, 将使用默认OCR处理")
            self.layout_model = None

    def process(self, file_content: bytes, filename: str) -> Dict[str, Any]:
        """处理文档内容，提取文本、布局和表格信息"""
        file_ext = os.path.splitext(filename)[1].lower()
        logger.info(f"开始处理文档: {filename}, 格式: {file_ext}")

        if file_ext == ".pdf":
            return self._process_pdf(file_content)
        elif file_ext in [".png", ".jpg", ".jpeg", ".tiff"]:
            return self._process_image(file_content)
        else:
            logger.warning(f"不支持的文件格式: {file_ext}")
            return self._process_generic_text(file_content)

    def _process_pdf(self, pdf_content: bytes) -> Dict[str, Any]:
        """处理PDF文件，提取文本、布局和表格"""
        try:
            # pdfplumber
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_pdf:
                temp_pdf.write(pdf_content)
                temp_pdf_path = temp_pdf.name

            text = []
            with PDFPlumber.open(temp_pdf_path) as pdf:
                for page in pdf.pages:
                    text.append(page.extract_text())
            full_text = "\n".join(text)

            tables = camelot.read_pdf(temp_pdf_path, flavor="lattice", pages="all")
            table_data = []
            for table in tables:
                table_data.append(table.df.to_dict("records"))

            layout_data = []
            if self.layout_model:
                images = convert_from_bytes(pdf_content)
                for idx, image in enumerate(images):
                    layout = self.layout_model.detect(image)
                    layout_data.append(
                        [
                            {"type": block.type, "coordinates": block.coordinates}
                            for block in layout
                        ]
                    )

            chunks = self._chunk_text(full_text, table_data, layout_data)

            os.unlink(temp_pdf_path)

            return {
                "text": full_text,
                "layout": layout_data,
                "tables": table_data,
                "chunks": chunks,
            }
        except Exception as e:
            logger.error(f"PDF处理失败: {str(e)}", exc_info=True)
            # OCR
            return self._process_image(pdf_content)

    def _process_image(self, image_content: bytes) -> Dict[str, Any]:
        """处理图片文件，使用OCR提取文本"""
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as temp_img:
                temp_img.write(image_content)
                temp_img_path = temp_img.name

            # Tesseract OCR
            text = pytesseract.image_to_string(Image.open(temp_img_path))

            chunks = self._chunk_text(text, [], [])

            os.unlink(temp_img_path)

            return {"text": text, "layout": [], "tables": [], "chunks": chunks}
        except Exception as e:
            logger.error(f"图片OCR处理失败: {str(e)}", exc_info=True)
            return {"text": "", "layout": [], "tables": [], "chunks": []}

    def _process_generic_text(self, text_content: bytes) -> Dict[str, Any]:
        """处理纯文本内容"""
        try:
            text = text_content.decode("utf-8", errors="replace")
            chunks = self._chunk_text(text, [], [])
            return {"text": text, "layout": [], "tables": [], "chunks": chunks}
        except Exception as e:
            logger.error(f"文本处理失败: {str(e)}", exc_info=True)
            return {"text": "", "layout": [], "tables": [], "chunks": []}

    def _chunk_text(
        self, text: str, tables: List[Any] = None, layouts: List[Any] = None
    ) -> List[str]:
        """将文本分块以便向量存储和检索"""
        tables = tables or []
        layouts = layouts or []

        chunks = []
        current_chunk = []
        chunk_size = 0

        for paragraph in text.split("\n\n"):
            if not paragraph.strip():
                continue

            # 500
            if chunk_size + len(paragraph) > 500:
                chunks.append("\n".join(current_chunk))
                current_chunk = [paragraph]
                chunk_size = len(paragraph)
            else:
                current_chunk.append(paragraph)
                chunk_size += len(paragraph)

        if current_chunk:
            chunks.append("\n".join(current_chunk))

        for table in tables:
            table_str = f"表格数据: {str(table)}"
            chunks.append(table_str)

        return chunks
