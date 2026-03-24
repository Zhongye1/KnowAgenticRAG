from fastapi import APIRouter, HTTPException, Form, Depends, UploadFile, File, Request
import jwt
import logging
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from typing import Optional
import os
import uuid
from datetime import datetime
from pydantic import BaseModel
from fastapi import Body

import base64
import aiofiles

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
router = APIRouter()

from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# 统一从公共配置模块导入，不再重复定义 DB_CONFIG
from RAGF_User_Management.db_config import get_db_connection

# 头像存储路径
AVATAR_DIR = "user_avatars"
os.makedirs(AVATAR_DIR, exist_ok=True)

def verify_jwt(token: str) -> dict:
    """
    验证JWT令牌
    """
    secret_key = os.getenv('JWT_SECRET', 'changeme_jwt_secret')
    try:
        return jwt.decode(token, secret_key, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        return {"error": "Token has expired"}
    except jwt.InvalidTokenError:
        return {"error": "Invalid token"}




@router.get("/api/user/GetUserData")
async def get_user_data(token: str = Depends(oauth2_scheme)):
    """
    获取用户数据
    """
    try:
        # 验证JWT
        decoded_token = verify_jwt(token)
        if "error" in decoded_token:
            raise HTTPException(
                status_code=401,
                detail=decoded_token["error"]
            )
        
        email = decoded_token["sub"]
        
        # 获取用户数据
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 使用正确的数据库
        cursor.execute("USE rag_user_db")
        
        # 确保user_profile表包含social_media字段
        try:
            cursor.execute("SELECT social_media FROM user_profile LIMIT 1")
        except pymysql.Error as e:
            if "Unknown column" in str(e):
                # 添加social_media字段
                cursor.execute("ALTER TABLE user_profile ADD COLUMN social_media VARCHAR(500) DEFAULT ''")
                conn.commit()
        
        # 查询用户ID
        cursor.execute("DESCRIBE user")
        columns = [column[0] for column in cursor.fetchall()]
        
        if 'id' not in columns:
            logger.error(f"用户表结构不正确，缺少id列。当前列: {columns}")
            raise HTTPException(
                status_code=500,
                detail="数据库表结构不正确，请联系管理员"
            )
        
        # 查询用户ID
        cursor.execute("SELECT id, email FROM user WHERE email=%s", (email,))
        user_result = cursor.fetchone()
        if not user_result:
            return {"status": "error", "message": "用户不存在"}
        
        user_id = user_result[0]
        user_email = user_result[1]
        
        # 查询用户资料（包含社交平台字段）
        cursor.execute("SELECT user_id, name, signature, social_media, avatar FROM user_profile WHERE user_id=%s", (user_id,))
        user_data = cursor.fetchone()
        
        # 默认头像链接
        default_avatar = "https://pic3.zhimg.com/80/v2-71152904edf11db5c8885548393ace6a_720w.webp"
        
        if user_data:
            # 如果头像为空，则使用默认头像
            avatar = user_data[4] if user_data[4] else default_avatar
            
            return {
                "status": "success", 
                "data": {
                    "user_id": user_data[0],
                    "name": user_data[1] or "",
                    "signature": user_data[2] or "",
                    "social_media": user_data[3] or "",  # 社交平台信息
                    "avatar": avatar,
                    "email": user_email
                }
            }
        else:
            # 如果用户资料不存在，创建默认资料
            cursor.execute("""
                INSERT INTO user_profile (user_id, name, signature, social_media, avatar)
                VALUES (%s, %s, %s, %s, %s)
            """, (user_id, "新用户", "这个人很懒，什么也没写", "", default_avatar))
            conn.commit()
            
            return {
                "status": "success",
                "data": {
                    "user_id": user_id,
                    "name": "新用户",
                    "signature": "这个人很懒，什么也没写",
                    "social_media": "",  # 社交平台信息
                    "avatar": default_avatar,
                    "email": user_email
                }
            }
    except Exception as e:
        logger.error(f"获取用户数据出错: {e}")
        raise HTTPException(
            status_code=500,
            detail="服务器内部错误"
        )
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

            

class UserDataUpdate(BaseModel):
    avatar: str
    email: str
    name: str
    signature: str
    social_media: str


@router.post("/api/UpdateUserData")
async def update_user_data(token: str = Depends(oauth2_scheme), user_data: UserDataUpdate = Body(...)):
    """
    更新用户数据
    """
    try:
        # 验证JWT
        decoded_token = jwt.decode(token, os.getenv('JWT_SECRET', 'changeme_jwt_secret'), algorithms=["HS256"])
        email = decoded_token["sub"]
        
        # 处理头像数据
        avatar_url = ""
        if user_data.avatar.startswith("data:image"):
            # 如果是base64格式的图片数据，保存为文件
            header, encoded = user_data.avatar.split(",", 1)
            file_extension = ".png"  # 默认png格式
            if "jpeg" in header:
                file_extension = ".jpg"
            elif "gif" in header:
                file_extension = ".gif"
            elif "webp" in header:
                file_extension = ".webp"
                
            # 使用与知识库封面相同的目录和命名方式
            avatar_upload_dir = os.path.join("local-KLB-files", "avatars")
            os.makedirs(avatar_upload_dir, exist_ok=True)
            
            # 生成唯一文件名
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            unique_filename = f"avatar_{timestamp}_{uuid.uuid4().hex[:8]}{file_extension}"
            avatar_path = os.path.join(avatar_upload_dir, unique_filename)
            
            # 保存上传的图片
            import aiofiles
            async with aiofiles.open(avatar_path, 'wb') as f:
                decoded_data = base64.b64decode(encoded)
                await f.write(decoded_data)
            
            # 构建可访问的URL路径
            avatar_url = f"/static/avatars/{unique_filename}"
        else:
            # 如果已经是URL，则直接使用
            avatar_url = user_data.avatar
        
        # 更新用户数据
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 使用正确的数据库
        cursor.execute("USE rag_user_db")
        
        cursor.execute("UPDATE user_profile SET name=%s, signature=%s, avatar=%s, social_media=%s WHERE user_id=(SELECT id FROM user WHERE email=%s)", (user_data.name, user_data.signature, avatar_url, user_data.social_media, email))
        conn.commit()
        if cursor.rowcount > 0:
            return {"status": "success", "message": "更新成功"}
        else:
            return {"status": "error", "message": "用户不存在或更新失败"}
    except Exception as e:
        logger.error(f"更新用户数据出错: {e}")
        raise HTTPException(
            status_code=401,
            detail="更新失败"
        )
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@router.post("/api/user/UpdateAvatar")
async def update_avatar(
    token: str = Depends(oauth2_scheme),
    avatar_file: UploadFile = File(...)
):
    """
    更新用户头像
    """
    try:
        # 验证JWT
        decoded_token = verify_jwt(token)
        if "error" in decoded_token:
            raise HTTPException(
                status_code=401,
                detail=decoded_token["error"]
            )
        
        email = decoded_token["sub"]
        
        # 使用与知识库封面相同的目录和命名方式
        avatar_upload_dir = os.path.join("local-KLB-files", "avatars")
        os.makedirs(avatar_upload_dir, exist_ok=True)
        
        # 生成唯一文件名
        file_extension = os.path.splitext(avatar_file.filename)[1]
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_filename = f"avatar_{timestamp}_{uuid.uuid4().hex[:8]}{file_extension}"
        avatar_path = os.path.join(avatar_upload_dir, unique_filename)
        
        # 保存上传的图片
        async with aiofiles.open(avatar_path, 'wb') as f:
            content = await avatar_file.read()
            await f.write(content)
        
        # 构建可访问的URL路径
        avatar_url = f"/static/avatars/{unique_filename}"
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 使用正确的数据库
        cursor.execute("USE rag_user_db")
        
        # 更新用户头像
        cursor.execute(
            "UPDATE user_profile SET avatar=%s WHERE user_id=(SELECT id FROM user WHERE email=%s)",
            (avatar_url, email)
        )
        conn.commit()
        
        if cursor.rowcount > 0:
            return {
                "status": "success", 
                "message": "头像更新成功",
                "avatar_url": avatar_url
            }
        else:
            return {"status": "error", "message": "用户不存在或更新失败"}
    except Exception as e:
        logger.error(f"更新用户头像出错: {e}")
        raise HTTPException(
            status_code=500,
            detail="头像更新失败"
        )
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()
            
@router.delete("/api/user/DeleteUserData")
async def delete_user_data(token: str = Depends(oauth2_scheme)):
    """
    删除用户数据
    """
    try:
        # 验证JWT
        decoded_token = verify_jwt(token)
        if "error" in decoded_token:
            raise HTTPException(
                status_code=401,
                detail=decoded_token["error"]
            )
        
        email = decoded_token["sub"]
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 使用正确的数据库
        cursor.execute("USE rag_user_db")

        # 删除用户（会自动级联删除用户资料）
        cursor.execute("DELETE FROM user WHERE email=%s", (email,))
        conn.commit()
        
        if cursor.rowcount > 0:
            logger.info(f"用户 {email} 及其资料已删除")
            return {"status": "success", "message": "用户删除成功"}
        else:
            logger.info(f"用户 {email} 不存在")
            return {"status": "error", "message": "用户不存在"}
    except Exception as e:
        logger.error(f"删除失败: {e}")
        raise HTTPException(
            status_code=500,
            detail="删除失败"
        )
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

# 拿到user.db所有的数据
@router.get("/api/user/GetUserAllData")
async def get_user_all_data():
    """
    获取所有用户数据
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 使用正确的数据库
    cursor.execute("USE rag_user_db")
    
    cursor.execute("SELECT id, email, created_at FROM user")
    user_data = cursor.fetchall()
    cursor.close()
    conn.close()
    
    if not user_data:
        raise HTTPException(
            status_code=400,
            detail="数据为空"
        )
    
    logger.info("用户数据为：", user_data)
    return {"status": "success", "data": user_data}