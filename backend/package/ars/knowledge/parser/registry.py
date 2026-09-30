"""文档处理器注册表和配置策略。"""

from importlib import import_module

PROCESSOR_TYPES = {
    "rapid_ocr": ("ars.knowledge.parser.rapid_ocr", "RapidOCRParser"),
    "mineru_ocr": ("ars.knowledge.parser.mineru", "MinerUParser"),
    "mineru_official": ("ars.knowledge.parser.mineru_official", "MinerUOfficialParser"),
    "pp_structure_v3_ocr": ("ars.knowledge.parser.pp_structure_v3", "PPStructureV3Parser"),
    "deepseek_ocr": ("ars.knowledge.parser.deepseek_ocr", "DeepSeekOCRParser"),
    "paddleocr_vl_1_6": ("ars.knowledge.parser.paddleocr_api", "PaddleOCRVLParser"),
    "paddleocr_pp_ocrv6": ("ars.knowledge.parser.paddleocr_api", "PaddleOCRPPOCRv6Parser"),
}


def get_parser_metadata(engine_id: str) -> dict[str, str | list[str]]:
    """从 parser 类读取并校验静态元数据。"""

    if engine_id not in PROCESSOR_TYPES:
        raise ValueError(f"不支持的 OCR 引擎: {engine_id}")
    module_path, class_name = PROCESSOR_TYPES[engine_id]
    processor_class = getattr(import_module(module_path), class_name)
    if processor_class.service_name != engine_id:
        raise ValueError(f"Parser service_name 不匹配: {engine_id} != {processor_class.service_name}")
    if not processor_class.display_name:
        raise ValueError(f"Parser display_name 未配置: {engine_id}")
    return {
        "service_name": processor_class.service_name,
        "display_name": processor_class.display_name,
        "supported_extensions": list(processor_class.supported_extensions),
    }
