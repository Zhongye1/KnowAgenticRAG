"""
部门管理路由
提供部门的增删改查接口，仅超级管理员可访问
"""

import re

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from server.utils.auth_middleware import get_admin_user, get_db, get_superadmin_user
from ars.repositories.department_repository import DepartmentRepository
from ars.repositories.user_repository import UserRepository
from ars.services.identity_admin_service import IdentityConflictError, create_department_with_admin
from ars.services.operation_log_service import log_operation
from ars.services.user_identity_service import is_valid_phone_number
from ars.storage.postgres.models_business import User

# 创建路由器
department = APIRouter(prefix="/departments", tags=["department"])


# =============================================================================
# === 请求和响应模型 ===
# =============================================================================


class DepartmentCreate(BaseModel):
    """创建部门请求"""

    name: str
    description: str | None = None
    # 必需的管理员信息
    admin_uid: str
    admin_password: str = Field(min_length=8)
    admin_phone: str | None = None


class DepartmentUpdate(BaseModel):
    """更新部门请求"""

    name: str | None = None
    description: str | None = None


class DepartmentResponse(BaseModel):
    """部门响应"""

    id: int
    name: str
    description: str | None = None
    created_at: str
    user_count: int = 0


# =============================================================================
# === 部门管理路由 ===
# =============================================================================


@department.get("", response_model=list[DepartmentResponse])
async def get_departments(current_user: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """获取所有部门列表（管理员可访问）"""
    dept_repo = DepartmentRepository(db)
    return await dept_repo.list_with_user_count()


@department.get("/{department_id}", response_model=DepartmentResponse)
async def get_department(
    department_id: int,
    current_user: User = Depends(get_superadmin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取指定部门详情"""
    department = await DepartmentRepository(db).get_with_user_count(department_id)
    if department is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="部门不存在")
    return department


@department.post("", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
async def create_department(
    department_data: DepartmentCreate,
    request: Request,
    current_user: User = Depends(get_superadmin_user),
    db: AsyncSession = Depends(get_db),
):
    """创建新部门，同时创建该部门的管理员"""
    dept_repo = DepartmentRepository(db)
    user_repo = UserRepository(db)

    # 检查部门名称是否已存在
    if await dept_repo.exists_by_name(department_data.name):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="部门名称已存在")

    # 验证管理员 uid 格式
    admin_uid = department_data.admin_uid
    if not re.match(r"^[a-zA-Z0-9_]+$", admin_uid):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户ID只能包含字母、数字和下划线",
        )

    if len(admin_uid) < 3 or len(admin_uid) > 20:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户ID长度必须在3-20个字符之间",
        )

    # 检查 uid 是否已存在
    if await user_repo.exists_by_uid(admin_uid):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户ID已存在",
        )

    # 检查手机号是否已存在（如果提供了）
    admin_phone = department_data.admin_phone
    if admin_phone:
        if not is_valid_phone_number(admin_phone):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="手机号格式不正确")
        if await user_repo.exists_by_phone(admin_phone):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="手机号已存在",
            )

    try:
        created = await create_department_with_admin(
            db,
            name=department_data.name,
            description=department_data.description,
            admin_uid=admin_uid,
            admin_password=department_data.admin_password,
            admin_phone=admin_phone,
            actor_user_id=current_user.id,
            request=request,
        )
    except IdentityConflictError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return {**created.department.to_dict(), "user_count": 1}


@department.put("/{department_id}", response_model=DepartmentResponse)
async def update_department(
    department_id: int,
    department_data: DepartmentUpdate,
    request: Request,
    current_user: User = Depends(get_superadmin_user),
    db: AsyncSession = Depends(get_db),
):
    """更新部门信息"""
    repository = DepartmentRepository(db)
    department = await repository.get_by_id(department_id)

    if not department:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="部门不存在")

    updates = {}
    # 如果要修改名称，检查新名称是否已存在
    if department_data.name and department_data.name != department.name:
        existing = await repository.get_by_name(department_data.name)
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="部门名称已存在")
        updates["name"] = department_data.name

    if department_data.description is not None:
        updates["description"] = department_data.description

    department = await repository.update(department_id, updates)
    if department is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="部门不存在")

    # 记录操作
    await log_operation(db, current_user.id, "更新部门", f"更新部门: {department.name}", request)

    # 获取部门下用户数量
    user_count = await repository.count_users(department_id)
    await db.commit()

    return {**department.to_dict(), "user_count": user_count}


@department.delete("/{department_id}", status_code=status.HTTP_200_OK)
async def delete_department(
    department_id: int,
    request: Request,
    current_user: User = Depends(get_superadmin_user),
    db: AsyncSession = Depends(get_db),
):
    """删除部门"""
    repository = DepartmentRepository(db)
    # 检查部门是否存在
    department = await repository.get_by_id(department_id)

    if not department:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="部门不存在")

    if department.id == 1:  # 默认部门的ID为1
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="默认部门不允许删除")

    deletion = await repository.delete_and_migrate_users(department_id)
    if deletion is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="部门不存在")

    # 记录操作
    if deletion.migrated_user_count:
        detail = f"删除部门: {deletion.name}，迁移 {deletion.migrated_user_count} 个用户到默认部门"
    else:
        detail = f"删除部门: {deletion.name}"
    await log_operation(db, current_user.id, "删除部门", detail, request)
    await db.commit()

    return {"success": True, "message": "部门已删除"}
