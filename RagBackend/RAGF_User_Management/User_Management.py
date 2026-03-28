

from fastapi import APIRouter, HTTPException, Form

import jwt
import logging
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
router = APIRouter()

import os
from dotenv import load_dotenv

# Environment variable
load_dotenv()

# DB_CONFIG
from RAGF_User_Management.db_config import get_db_connection


@router.get("/api/GetUserData")
async def get_user_data(token: str = Depends(oauth2_scheme)):
    """
    获取用户数据
    """
    print("token:", token)
    conn = None
    cursor = None
    try:
        # JWT
        decoded_token = jwt.decode(token, os.getenv('JWT_SECRET', 'changeme_jwt_secret'), algorithms=["HS256"])
        email = decoded_token["sub"]
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # ID
        cursor.execute("SELECT id FROM user WHERE email=%s", (email,))
        user_result = cursor.fetchone()
        if not user_result:
            return {"status": "error", "message": "用户不存在"}
        
        user_id = user_result[0]
        
        cursor.execute("SELECT user_id, name, signature, avatar FROM user_profile WHERE user_id=%s", (user_id,))
        user_data = cursor.fetchone()
        if user_data:
            return {"status": "success", "data": user_data}
        else:
            return {"status": "error", "message": "用户资料不存在"}
    except Exception as e:
        print(f"获取用户数据出错: {e}")
        raise HTTPException(
            status_code=401,
            detail="错误"
        )
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()



@router.post("/api/UpdateUserData")
async def update_user_data(token: str = Depends(oauth2_scheme),name: str = Form(...), signatur: str = Form(...), avatar: str = Form(...)):
    """
    更新用户数据
    """
    conn = None
    cursor = None
    try:
        # JWT
        decoded_token = jwt.decode(token, os.getenv('JWT_SECRET', 'changeme_jwt_secret'), algorithms=["HS256"])
        email = decoded_token["sub"]
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE user_profile SET name=%s, signature=%s, avatar=%s WHERE user_id=(SELECT id FROM user WHERE email=%s)", (name, signatur, avatar, email))
        conn.commit()
        if cursor.rowcount > 0:
            return {"status": "success", "message": "更新成功"}
        else:
            return {"status": "error", "message": "用户不存在或更新失败"}
    except Exception as e:
        print(f"更新用户数据出错: {e}")
        raise HTTPException(
            status_code=401,
            detail="更新失败"
        )
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@router.delete("/api/DeleteUserData")
async def delete_user_data(token: str = Depends(oauth2_scheme)):
    conn = None
    cursor = None
    try:
        # JWT
        decoded_token = jwt.decode(token, os.getenv('JWT_SECRET', 'changeme_jwt_secret'), algorithms=["HS256"])
        email = decoded_token["sub"]
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("DELETE FROM user WHERE email=%s", (email,))
        conn.commit()
        
        if cursor.rowcount > 0:
            print(f"用户 {email} 及其资料已删除")
            return {"status": "success", "message": "用户删除成功"}
        else:
            print(f"用户 {email} 不存在")
            return {"status": "error", "message": "用户不存在"}
    except Exception as e:
        print(f"删除失败: {e}")
        raise HTTPException(
            status_code=401,
            detail="删除失败"
        )
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# user.db
@router.get("/api/GetUserAllData")
async def get_user_all_data():
    """
    获取所有用户数据
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, email, created_at FROM user")
    user_data = cursor.fetchall()
    cursor.close()
    conn.close()
    if not user_data:
        raise HTTPException(
            status_code=400,
            detail="数据为空"
        )
    print("用户数据为：", user_data)
    return {"status": "success", "data": user_data}
