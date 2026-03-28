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

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
router = APIRouter()

from dotenv import load_dotenv

# Environment variable
load_dotenv()

# DB_CONFIG
from RAGF_User_Management.db_config import get_db_connection

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
    Get user profile data.
    """
    conn = None
    cursor = None
    try:
        # Verify JWT
        decoded_token = verify_jwt(token)
        if "error" in decoded_token:
            raise HTTPException(
                status_code=401,
                detail=decoded_token["error"]
            )
        
        email = decoded_token["sub"]
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("USE rag_user_db")
        
        # user_profilesocial_media
        try:
            cursor.execute("SELECT social_media FROM user_profile LIMIT 1")
        except pymysql.Error as e:
            if "Unknown column" in str(e):
                # social_media
                cursor.execute("ALTER TABLE user_profile ADD COLUMN social_media VARCHAR(500) DEFAULT ''")
                conn.commit()
        
        # ID
        cursor.execute("DESCRIBE user")
        columns = [column[0] for column in cursor.fetchall()]
        
        if 'id' not in columns:
            logger.error(f"用户表结构不正确，缺少id列。当前列: {columns}")
            raise HTTPException(
                status_code=500,
                detail="数据库表结构不正确，请联系管理员"
            )
        
        # ID
        cursor.execute("SELECT id, email FROM user WHERE email=%s", (email,))
        user_result = cursor.fetchone()
        if not user_result:
            return {"status": "error", "message": "用户不存在"}
        
        user_id = user_result[0]
        user_email = user_result[1]
        
        cursor.execute("SELECT user_id, name, signature, social_media, avatar FROM user_profile WHERE user_id=%s", (user_id,))
        user_data = cursor.fetchone()
        
        default_avatar = "https://pic3.zhimg.com/80/v2-71152904edf11db5c8885548393ace6a_720w.webp"
        
        if user_data:
            avatar = user_data[4] if user_data[4] else default_avatar
            
            return {
                "status": "success", 
                "data": {
                    "user_id": user_data[0],
                    "name": user_data[1] or "",
                    "signature": user_data[2] or "",
                    "social_media": user_data[3] or "",
                    "avatar": avatar,
                    "email": user_email
                }
            }
        else:
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
                    "social_media": "",
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
    Update user profile data.
    """
    conn = None
    cursor = None
    try:
        decoded_token = jwt.decode(token, os.getenv('JWT_SECRET', 'changeme_jwt_secret'), algorithms=["HS256"])
        email = decoded_token["sub"]
        
        avatar_url = ""
        if user_data.avatar.startswith("data:image"):
            header, encoded = user_data.avatar.split(",", 1)
            file_extension = ".png"
            if "jpeg" in header:
                file_extension = ".jpg"
            elif "gif" in header:
                file_extension = ".gif"
            elif "webp" in header:
                file_extension = ".webp"
                
            avatar_upload_dir = os.path.join("local-KLB-files", "avatars")
            os.makedirs(avatar_upload_dir, exist_ok=True)
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            unique_filename = f"avatar_{timestamp}_{uuid.uuid4().hex[:8]}{file_extension}"
            avatar_path = os.path.join(avatar_upload_dir, unique_filename)
            
            import aiofiles
            async with aiofiles.open(avatar_path, 'wb') as f:
                decoded_data = base64.b64decode(encoded)
                await f.write(decoded_data)
            
            avatar_url = f"/static/avatars/{unique_filename}"
        else:
            avatar_url = user_data.avatar
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
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
    Update user avatar via file upload.
    """
    conn = None
    cursor = None
    try:
        # JWT
        decoded_token = verify_jwt(token)
        if "error" in decoded_token:
            raise HTTPException(
                status_code=401,
                detail=decoded_token["error"]
            )
        
        email = decoded_token["sub"]
        
        avatar_upload_dir = os.path.join("local-KLB-files", "avatars")
        os.makedirs(avatar_upload_dir, exist_ok=True)
        
        file_extension = os.path.splitext(avatar_file.filename)[1]
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_filename = f"avatar_{timestamp}_{uuid.uuid4().hex[:8]}{file_extension}"
        avatar_path = os.path.join(avatar_upload_dir, unique_filename)
        
        async with aiofiles.open(avatar_path, 'wb') as f:
            content = await avatar_file.read()
            await f.write(content)
        
        # URL
        avatar_url = f"/static/avatars/{unique_filename}"
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("USE rag_user_db")
        
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
        if cursor:
            cursor.close()
        if conn:
            conn.close()
            
@router.delete("/api/user/DeleteUserData")
async def delete_user_data(token: str = Depends(oauth2_scheme)):
    """
    Delete user account and all associated data.
    """
    conn = None
    cursor = None
    try:
        # JWT
        decoded_token = verify_jwt(token)
        if "error" in decoded_token:
            raise HTTPException(
                status_code=401,
                detail=decoded_token["error"]
            )
        
        email = decoded_token["sub"]
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("USE rag_user_db")

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

# user.db
@router.get("/api/user/GetUserAllData")
async def get_user_all_data():
    """
    Get all user records (admin/debug endpoint).
    """
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("USE rag_user_db")
        
        cursor.execute("SELECT id, email, created_at FROM user")
        user_data = cursor.fetchall()
        
        if not user_data:
            raise HTTPException(status_code=400, detail="No users found")
        
        logger.info(f"GetUserAllData: returned {len(user_data)} users")
        return {"status": "success", "data": user_data}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"GetUserAllData failed: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()