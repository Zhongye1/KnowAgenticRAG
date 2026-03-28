from contextlib import closing

from fastapi import APIRouter, HTTPException, Form, Depends, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
import jwt

from datetime import datetime, timedelta
import hashlib
import logging
from pydantic import BaseModel
from typing import Optional
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
router = APIRouter()

class UserCreate(BaseModel):
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login/login")

# DB_CONFIG
from RAGF_User_Management.db_config import get_db_connection


def create_user_table():
    """
    创建用户表（如果不存在则创建）。
    仅在首次被调用时执行，不再于模块加载时立即连接 MySQL。
    """
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("CREATE DATABASE IF NOT EXISTS rag_user_db")
        cursor.execute("USE rag_user_db")

        cursor.execute('''CREATE TABLE IF NOT EXISTS user(
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )''')
        
        conn.commit()
        logger.info("用户表验证完成")
        return True

    except Exception as e:
        logger.error(f"数据库操作出错: {e}")
        return False
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass


def create_userData_table():
    """
    创建用户数据表（如果不存在则创建）。
    仅在首次被调用时执行，不再于模块加载时立即连接 MySQL。
    """
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("USE rag_user_db")
        
        cursor.execute('''CREATE TABLE IF NOT EXISTS user_profile(
           user_id INT PRIMARY KEY,
           name VARCHAR(100),
           signature TEXT,
           social_media VARCHAR(500),
           avatar VARCHAR(255),
           FOREIGN KEY(user_id) REFERENCES user(id) ON DELETE CASCADE
        )''')
        conn.commit()
        logger.info("用户数据表验证完成")
        return True
    except Exception as e:
        logger.error(f"数据库操作出错: {e}")
        return False
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass


def ensure_tables_exist():
    """
    懒加载初始化：首次有真实请求时调用，而非模块 import 时调用。
    这样即使 MySQL 未启动，后端也能正常启动。
    在 main.py 的 startup 事件中调用此函数。
    """
    create_user_table()
    create_userData_table()

# ensure_tables_exist()
# create_user_table()
# create_userData_table()


def create_user(email: str, password: str) -> bool:
    """
    创建用户
    """
    conn = None
    try:
        # /
        email = email.strip().lower()
        hashed_password = hashlib.sha256(password.encode()).hexdigest()
        print(email, password)
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("USE rag_user_db")

        cursor.execute("SELECT * FROM user WHERE email = %s", (email,))
        if cursor.fetchone():
            logger.warn("邮箱已存在")
            return False

        cursor.execute("INSERT INTO user (email, password) VALUES (%s, %s)",
                       (email, hashed_password))
        conn.commit()

        cursor.execute("SELECT * FROM user WHERE email = %s", (email,))
        if cursor.fetchone():
            logger.info("用户创建成功")
            return True
        return False

    except Exception as e:
        logger.info(f"数据库操作出错: {e}")
        return False
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass


# User login
def user_login(email: str, password: str) -> bool:
    """
    用户登录验证
    """
    conn = None
    try:
        email = email.strip().lower()
        hashed_password = hashlib.sha256(password.encode()).hexdigest()

        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("USE rag_user_db")

        cursor.execute("SELECT * FROM user WHERE email = %s AND password = %s",
                       (email, hashed_password))
        user = cursor.fetchone()

        return user is not None

    except Exception as e:
        logger.error(f"数据库操作出错: {e}")
        return False
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass


# JWT token
def authenticate_user(email: str) -> str:
    """
    生成JWT令牌
    """
    secret_key = os.getenv('JWT_SECRET', 'changeme_jwt_secret')
    payload = {
        "sub": email,
        "exp": datetime.utcnow() + timedelta(hours=24)  # 24h
    }
    try:
        return jwt.encode(payload, secret_key, algorithm="HS256")
    except AttributeError:
        try:
            from jwt import encode as jwt_encode
            return jwt_encode(payload, secret_key, algorithm="HS256")
        except (ImportError, AttributeError):
            raise Exception("无法生成JWT令牌，请检查PyJWT库的安装")

# JWT token
def verify_jwt(token: str) -> dict:
    """
    验证JWT令牌
    """
    secret_key = os.getenv('JWT_SECRET', 'changeme_jwt_secret')
    try:
        return jwt.decode(token, secret_key, algorithms=["HS256"])
    except AttributeError:
        try:
            from jwt import decode as jwt_decode
            return jwt_decode(token, secret_key, algorithms=["HS256"])
        except (ImportError, AttributeError):
            return {"error": "无法解码JWT令牌"}




# user_profile.dbInitialize

def init_profile(email: str) -> bool:
    """
    初始化用户数据表 (修复版)
    """
    # ID
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("USE rag_user_db")
        
        cursor.execute("DESCRIBE user")
        columns = [column[0] for column in cursor.fetchall()]
        
        if 'id' not in columns:
            logger.error(f"用户表结构不正确，缺少id列。当前列: {columns}")
            return False
            
        # ID
        cursor.execute("SELECT id FROM user WHERE email = %s", (email,))
        result = cursor.fetchone()

        if not result:
            logger.error(f"用户不存在: {email}")
            return False

        user_id = result[0]
        
        cursor.close()
        conn.close()
        conn = None
        
    except Exception as e:
        logger.error(f"获取用户ID失败: {e}")
        return False
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("USE rag_user_db")
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_profile (
                user_id INT NOT NULL UNIQUE,
                name VARCHAR(100) DEFAULT '新用户',
                signature TEXT DEFAULT '这个人很懒，什么也没写',
                social_media VARCHAR(500) DEFAULT '',  -- 社交平台信息
                avatar VARCHAR(255) DEFAULT 'https://pic3.zhimg.com/80/v2-71152904edf11db5c8885548393ace6a_720w.webp',
                FOREIGN KEY(user_id) REFERENCES user(id) ON DELETE CASCADE,
                PRIMARY KEY (user_id)
            )
        """)

        # Initialize
        cursor.execute("""
            INSERT IGNORE INTO user_profile (user_id, name, signature, social_media, avatar)
            VALUES (%s, %s, %s, %s, %s)
        """, (user_id, "初始化内容", "初始化签名", "", "https://pic3.zhimg.com/80/v2-71152904edf11db5c8885548393ace6a_720w.webp"))
        
        conn.commit()
        return True
    except Exception as e:
        logger.error(f"创建用户配置失败: {e}")
        return False
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass


def safe_db_operation(email):
    token = authenticate_user(email)
    init_profile(email)
    return token

# - JSON
@router.post("/api/register", response_model=dict)
async def register_user(user: UserCreate):
    """
    用户注册接口 (JSON格式)
    """
    email = user.email.strip().lower()
    if create_user(email, user.password):
        token = safe_db_operation(email)
        return {
            "status": "success",
            "message": "用户注册成功",
            "token": token
        }
    else:
        raise HTTPException(
            status_code=400,
            detail="用户注册失败（可能邮箱已存在）"
        )

@router.post("/api/register/form", response_model=dict)
async def register_user_form(email: str = Form(...), password: str = Form(...)):
    """
    用户注册接口 (表单格式)
    """
    email = email.strip().lower()
    if create_user(email, password):
        token = safe_db_operation(email)
        return {
            "status": "success",
            "message": "用户注册成功",
            "token": token
        }
    else:
        raise HTTPException(
            status_code=400,
            detail="用户注册失败（可能邮箱已存在）"
        )

@router.post("/api/login", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    """
    用户登录接口 (OAuth2标准格式)
    """
    email = form_data.username.strip().lower()  # OAuth2usernameemail
    if user_login(email, form_data.password):
        token = authenticate_user(email)
        return {"access_token": token, "token_type": "bearer"}
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )

@router.post("/api/login/json", response_model=dict)
async def login_user_json(user: UserLogin):
    """
    用户登录接口 (JSON格式)
    """
    email = user.email.strip().lower()
    if user_login(email, user.password):
        token = authenticate_user(email)
        return {
            "status": "success",
            "message": "登录成功",
            "token": token
        }
    else:
        raise HTTPException(
            status_code=401,
            detail="用户名或密码错误"
        )

@router.post("/api/login/form", response_model=dict)
async def login_user_form(email: str = Form(...), password: str = Form(...)):
    """
    用户登录接口 (表单格式)
    """
    email = email.strip().lower()
    if user_login(email, password):
        token = authenticate_user(email)
        return {
            "status": "success",
            "message": "登录成功",
            "token": token
        }
    else:
        raise HTTPException(
            status_code=401,
            detail="用户名或密码错误"
        )

@router.get("/api/users/me", response_model=dict)
async def read_users_me(token: str = Depends(oauth2_scheme)):
    """
    获取当前用户信息
    """
    result = verify_jwt(token)
    if "error" in result:
        raise HTTPException(
            status_code=401,
            detail=result["error"]
        )
    
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("USE rag_user_db")
        
        cursor.execute("SELECT id, email, created_at FROM user WHERE email = %s", (result["sub"],))
        user = cursor.fetchone()
        
        if user:
            return {
                "status": "success",
                "user": {
                    "id": user[0],
                    "email": user[1],
                    "created_at": user[2]
                }
            }
        else:
            raise HTTPException(
                status_code=404,
                detail="用户不存在"
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取用户信息出错: {e}")
        raise HTTPException(
            status_code=500,
            detail="服务器内部错误"
        )
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@router.post("/api/verify-token", response_model=dict)
async def verify_token_endpoint(token: str = Form(...)):
    """
    验证JWT令牌
    """
    result = verify_jwt(token)
    if "error" in result:
        raise HTTPException(
            status_code=401,
            detail=result["error"]
        )
    return {
        "status": "success",
        "message": "令牌有效",
        "data": result
    }

@router.post("/api/logout", response_model=dict)
async def logout_user():
    """
    用户退出登录
    注意：JWT是无状态的，服务端无法直接使其失效
    这里只是返回成功消息，实际的token清理需要客户端处理
    """
    return {
        "status": "success",
        "message": "退出登录成功"
    }