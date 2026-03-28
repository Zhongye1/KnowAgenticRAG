
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

def knowledge_base_data() -> List[dict]:
    """知识库数据获取"""

    base_dir = "local-KLB-files"
    knowledge_bases = []
    

    # base_dir
    for kb_name in os.listdir(base_dir):
        kb_dir = os.path.join(base_dir, kb_name)
        json_file_path = os.path.join(kb_dir, 'knowledge_data.json')

        # knowledge_data.json
        if os.path.exists(json_file_path):
            with open(json_file_path, 'r', encoding='utf-8') as f:
                kb_data = json.load(f)
                knowledge_bases.append(kb_data)

    # createdTime
    knowledge_bases.sort(key=lambda x: datetime.strptime(x['createdTime'], '%Y-%m-%d %H:%M:%S'))


    KLB_items = knowledge_bases

    print(KLB_items)
    
    return KLB_items




@router.post("/api/create-knowledgebase/")

async def create_knowledgebase(kbName: str = Form(...), owner_id: Optional[str] = Form(None)):
    """创建知识库（owner_id 可选，传入则绑定到该用户）"""
    base_dir = "local-KLB-files"
    kb_dir = os.path.join(base_dir, kbName)

    # base_dir
    if not os.path.exists(base_dir):
        os.makedirs(base_dir)

    # kb_dir
    if not os.path.exists(kb_dir):
        os.makedirs(kb_dir)
        
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
            "relation_extraction": True,
            "owner_id": owner_id or "",
        }
        
        # JSON
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
        base_dir = "local-KLB-files"
        kb_dir = os.path.join(base_dir, KLB_id)
        
        if not os.path.exists(kb_dir):
            raise HTTPException(
                status_code=404, 
                detail=f"知识库 '{KLB_id}' 不存在"
            )
        
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
        body = await request.json()
        print(f"接收到更新请求: KLB_id={KLB_id}, body={body}")
        
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
        
        # Config file
        base_dir = "local-KLB-files"
        kb_dir = os.path.join(base_dir, KLB_id)
        json_file_path = os.path.join(kb_dir, 'knowledge_data.json')
        
        if not os.path.exists(kb_dir):
            raise HTTPException(
                status_code=404, 
                detail=f"知识库 '{KLB_id}' 不存在"
            )
        
        with open(json_file_path, 'r', encoding='utf-8') as f:
            kb_data = json.load(f)
        
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

        # JSON
        for key, value in body.items():
            if value is not None:  # None
                kb_data[key] = value
            
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
async def get_knowledge_items(user_id: Optional[str] = None):
    """
    获取知识库项目列表
    - user_id 为空：返回所有知识库（全局列表，用于 Chat 等场景）
    - user_id 非空：只返回该用户创建的知识库（用于广场发布选择等场景）
    """
    try:
        data = knowledge_base_data()

        # owner_id owner_id ""
        # user_id owner_id owner_id KB
        if user_id:
            data = [kb for kb in data if kb.get("owner_id", "") in (user_id, "")]

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


@router.get("/api/list-knowledge-bases/")
async def list_knowledge_bases_alias(user_id: Optional[str] = None):
    """
    /api/get-knowledge-item/ 的别名接口，返回格式更简洁（直接 list）
    - user_id 非空：只返回该用户的知识库（owner_id 匹配 或 owner_id 为空的旧数据）
    """
    try:
        data = knowledge_base_data()

        if user_id:
            data = [kb for kb in data if kb.get("owner_id", "") in (user_id, "")]

        # res.data
        return JSONResponse(status_code=200, content=data)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取知识库列表失败: {str(e)}")

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

