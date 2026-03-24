
from fastapi.responses import JSONResponse
from fastapi import UploadFile, File, APIRouter, HTTPException, Form, Request

from typing import List, Optional
from pydantic import BaseModel
import os
import json
from pydantic import BaseModel
from datetime import datetime
import aiofiles
from pathlib import Path
import asyncio

router = APIRouter()


"""
知识库管理，实现知识库的增删改查

"""


class KnowledgeItem(BaseModel):
    id: str
    title: str
    avatar: str
    description: str
    createdTime: str
    cover: str

# 知识库数据获取
def knowledge_base_data() -> List[dict]:
    """知识库数据获取"""

    base_dir = "local-KLB-files"
    knowledge_bases = []
    

    # 遍历 base_dir 下的所有子目录
    for kb_name in os.listdir(base_dir):
        kb_dir = os.path.join(base_dir, kb_name)
        json_file_path = os.path.join(kb_dir, 'knowledge_data.json')

        # 检查 knowledge_data.json 文件是否存在
        if os.path.exists(json_file_path):
            with open(json_file_path, 'r', encoding='utf-8') as f:
                kb_data = json.load(f)
                knowledge_bases.append(kb_data)

    # 按 createdTime 排序
    knowledge_bases.sort(key=lambda x: datetime.strptime(x['createdTime'], '%Y-%m-%d %H:%M:%S'))


    # 知识库数据列表
    KLB_items = knowledge_bases

    print(KLB_items)
    
    return KLB_items




@router.post("/api/create-knowledgebase/")

async def create_knowledgebase(kbName: str = Form(...)):
    """创建知识库"""
    # 定义知识库目录
    base_dir = "local-KLB-files"
    kb_dir = os.path.join(base_dir, kbName)

    # 检查 base_dir 是否存在，如果不存在则创建
    if not os.path.exists(base_dir):
        os.makedirs(base_dir)

    # 检查 kb_dir 是否存在，如果不存在则创建
    if not os.path.exists(kb_dir):
        os.makedirs(kb_dir)
        
        # 定义要写入的数据
        data = {
            'id': kbName,
            'title': kbName,
            'avatar': 'https://avatars.githubusercontent.com/u/145737758?v=4',
            'description': '新建知识库',
            'createdTime': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'cover': "https://picx.zhimg.com/80/v2-381cc3f4ba85f62cdc483136e5fa4f47_720w.webp?source=d16d100b'",
            "embedding_model": "sentence-transformers/all-MiniLM-L6-v2",
            "chunk_size": 1000,
            "chunk_overlap": 200,
            "pdfParser": 'PyPDFLoader',
            "docxParser": 'Docx2txtLoader',
            "excelParser": 'Unstructured Excel Loader',
            "csvParser": 'CsvLoader',
            "txtParser": 'TextLoader',
            "segmentMethod": 'General',
            # 以下是需要补充的字段
            "name": kbName,
            "vector_dimension": 768,
            "similarity_threshold": 0.7,
            "convert_table_to_html": True,
            "preserve_layout": False,
            "remove_headers": True,
            "extract_knowledge_graph": False,
            "kg_method": "通用",
            "selected_entity_types": [
                "PERSON",
                "ORGANIZATION",
                "LOCATION"
            ],
            "entity_normalization": True,
            "community_report": False,
            "relation_extraction": True
        }
        
        # 将数据写入 JSON 文件
        json_file_path = os.path.join(kb_dir, 'knowledge_data.json')
        with open(json_file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
        
        return JSONResponse(content={"message": "Knowledge base created successfully."}, status_code=200)
    else:
        raise HTTPException(status_code=400, detail="Knowledge base already exists.")



@router.delete("/api/delete-knowledgebase/{KLB_id}")
async def delete_knowledgebase(KLB_id: str):
    """
    删除知识库
    根据知识库ID删除对应的文件夹及其内容
    """
    try:
        # 定义知识库目录
        base_dir = "local-KLB-files"
        kb_dir = os.path.join(base_dir, KLB_id)
        
        # 检查知识库目录是否存在
        if not os.path.exists(kb_dir):
            raise HTTPException(
                status_code=404, 
                detail=f"知识库 '{KLB_id}' 不存在"
            )
        
        # 删除整个文件夹及其内容
        import shutil
        shutil.rmtree(kb_dir)
        
        return JSONResponse(
            status_code=200,
            content={
                "code": 200,
                "message": f"知识库 '{KLB_id}' 已成功删除",
                "deletedAt": datetime.now().isoformat()
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"删除知识库失败: {str(e)}"
        )



@router.post("/api/update-knowledgebase-config/{KLB_id}")
async def update_knowledgebase_config(KLB_id: str, request: Request):
    """
    更新知识库配置
    接收知识库ID和配置数据，更新对应知识库的配置信息
    """
    try:
        # 读取请求体数据
        body = await request.json()
        print(f"接收到更新请求: KLB_id={KLB_id}, body={body}")
        
        # 获取所有可能的配置参数
        name = body.get("name")
        description = body.get("description")
        embedding_model = body.get("embedding_model")
        chunk_size = body.get("chunk_size")
        chunk_overlap = body.get("chunk_overlap")
        pdfParser = body.get("pdfParser")
        docxParser = body.get("docxParser")
        excelParser = body.get("excelParser")
        csvParser = body.get("csvParser")
        txtParser = body.get("txtParser")
        segmentMethod = body.get("segmentMethod")
        
        # 定义知识库目录和配置文件路径
        base_dir = "local-KLB-files"
        kb_dir = os.path.join(base_dir, KLB_id)
        json_file_path = os.path.join(kb_dir, 'knowledge_data.json')
        
        # 检查知识库目录是否存在
        if not os.path.exists(kb_dir):
            raise HTTPException(
                status_code=404, 
                detail=f"知识库 '{KLB_id}' 不存在"
            )
        
        # 读取现有配置
        with open(json_file_path, 'r', encoding='utf-8') as f:
            kb_data = json.load(f)
        
        # 更新所有配置项
        if name:
            kb_data['title'] = name
        if description:
            kb_data['description'] = description
        if embedding_model:
            kb_data['embedding_model'] = embedding_model
        if chunk_size is not None:
            kb_data['chunk_size'] = chunk_size
        if chunk_overlap is not None:
            kb_data['chunk_overlap'] = chunk_overlap
        if pdfParser:
            kb_data['pdfParser'] = pdfParser
        if docxParser:
            kb_data['docxParser'] = docxParser
        if excelParser:
            kb_data['excelParser'] = excelParser
        if csvParser:
            kb_data['csvParser'] = csvParser
        if txtParser:
            kb_data['txtParser'] = txtParser
        if segmentMethod:
            kb_data['segmentMethod'] = segmentMethod

        # 直接更新所有请求体中的配置项，无论原JSON中是否已存在
        for key, value in body.items():
            if value is not None:  # 只更新非None的值
                kb_data[key] = value
            
        # 保存更新后的配置
        with open(json_file_path, 'w', encoding='utf-8') as f:
            json.dump(kb_data, f, ensure_ascii=False, indent=4)
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": "知识库配置已更新",
                "data": kb_data
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"更新知识库配置失败: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"更新知识库配置失败: {str(e)}"
        )





@router.get("/api/get-knowledge-item/")

async def get_knowledge_items():
    """
    获取知识库项目列表
    返回所有可用的知识库项目数据
    """
    try:
        # 生成测试数据
        data = knowledge_base_data()
        
        return JSONResponse(
            status_code=200,
            content={
                "code": 200,
                "message": "获取知识库数据成功",
                "data": data,
                "total": len(data)
            }
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"获取知识库数据失败: {str(e)}"
        )

@router.get("/api/get-knowledge-item/{item_id}")
async def get_knowledge_item_by_id(item_id: str):
    """
    根据ID获取单个知识库项目
    """
    try:
        data = knowledge_base_data()
        item = next((item for item in data if item['id'] == item_id), None)
        
        if not item:
            raise HTTPException(
                status_code=404,
                detail=f"未找到ID为 {item_id} 的知识库项目"
            )
            
        return JSONResponse(
            status_code=200,
            content={
                "code": 200,
                "message": "获取知识库项目成功",
                "data": item
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"获取知识库项目失败: {str(e)}"
        )

# 如果需要分页功能
@router.get("/api/get-knowledge-item/")
async def get_knowledge_items_paginated(
    page: int = 1,
    page_size: int = 10,
    search: Optional[str] = None
):
    """
    分页获取知识库项目列表
    """
    try:
        data = knowledge_base_data()
        
        # 搜索过滤
        if search:
            data = [
                item for item in data 
                if search.lower() in item['title'].lower() 
                or search.lower() in item['description'].lower()
            ]
        
        # 分页
        total = len(data)
        start_index = (page - 1) * page_size
        end_index = start_index + page_size
        paginated_data = data[start_index:end_index]
        
        return JSONResponse(
            status_code=200,
            content={
                "code": 200,
                "message": "获取知识库数据成功",
                "data": paginated_data,
                "pagination": {
                    "page": page,
                    "page_size": page_size,
                    "total": total,
                    "total_pages": (total + page_size - 1) // page_size
                }
            }
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"获取知识库数据失败: {str(e)}"
        )