from fastapi import UploadFile, File, APIRouter, HTTPException, Form
import os
import uuid
from datetime import datetime
import aiofiles
from pathlib import Path


router = APIRouter()


"""
知识库封面图床

"""

UPLOAD_DIR = Path("local-KLB-files")


@router.post("/api/upload-cover")
async def upload_cover_image(image: UploadFile = File(...), KLB_id=Form(...)):
    """
    上传知识库封面图片
    """
    try:
        cover_upload_dir = os.path.join(UPLOAD_DIR, "covers")
        os.makedirs(cover_upload_dir, exist_ok=True)

        file_ext = os.path.splitext(image.filename)[1]
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_filename = f"cover_{timestamp}_{uuid.uuid4().hex[:8]}{file_ext}"
        image_path = os.path.join(cover_upload_dir, unique_filename)

        async with aiofiles.open(image_path, "wb") as f:
            content = await image.read()
            await f.write(content)

        # URL
        # /static/covers/
        image_url = f"/static/covers/{unique_filename}"

        # json
        base_url = "http://localhost:8000"
        alter_img_url = f"{base_url}/static/covers/{unique_filename}"

        # json
        kb_dir = os.path.join(UPLOAD_DIR, KLB_id)
        json_file_path = os.path.join(kb_dir, "knowledge_data.json")

        # Config file
        if not os.path.exists(json_file_path):
            raise HTTPException(
                status_code=404, detail=f"知识库 '{KLB_id}' 配置文件不存在"
            )

        import json

        with open(json_file_path, "r", encoding="utf-8") as f:
            kb_data = json.load(f)

        # URL
        kb_data["cover"] = alter_img_url

        with open(json_file_path, "w", encoding="utf-8") as f:
            json.dump(kb_data, f, ensure_ascii=False, indent=4)

        return {"success": True, "message": "封面图片上传成功", "imageUrl": image_url}
    except Exception as e:
        print(f"封面图片上传失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"封面图片上传失败: {str(e)}")
