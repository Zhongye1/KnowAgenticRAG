"""Dashboard 统计与监控 HTTP 路由。"""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from server.utils.auth_middleware import get_db, get_superadmin_user
from ars.services.dashboard_service import DashboardService
from ars.storage.postgres.models_business import User

dashboard = APIRouter(prefix="/dashboard", tags=["Dashboard"])


class UserActivityStats(BaseModel):
    """用户活跃度统计。"""

    total_users: int
    active_users_24h: int
    active_users_30d: int
    daily_active_users: list[dict]


class ToolCallStats(BaseModel):
    """工具调用统计。"""

    total_calls: int
    successful_calls: int
    failed_calls: int
    success_rate: float
    most_used_tools: list[dict]
    tool_error_distribution: dict
    daily_tool_calls: list[dict]


class AgentAnalytics(BaseModel):
    """AI 智能体分析。"""

    total_agents: int
    agent_conversation_counts: list[dict]
    agent_satisfaction_rates: list[dict]
    agent_tool_usage: list[dict]
    top_performing_agents: list[dict]
    agent_names: dict[str, str] = {}


class ConversationListItem(BaseModel):
    """Dashboard 对话列表项。"""

    thread_id: str
    uid: str
    username: str | None = None
    user_avatar: str | None = None
    user_deleted: bool = False
    agent_id: str
    agent_name: str | None = None
    agent_avatar: str | None = None
    agent_deleted: bool = False
    title: str | None
    status: str
    is_pinned: bool = False
    message_count: int
    total_tokens: int = 0
    created_at: str
    updated_at: str


class ConversationListResponse(BaseModel):
    """会话分页列表响应。"""

    items: list[ConversationListItem]
    total: int
    limit: int
    offset: int


class ConversationFilterOption(BaseModel):
    """会话审计筛选选项。"""

    uid: str | None = None
    username: str | None = None
    agent_id: str | None = None
    agent_name: str | None = None
    avatar: str | None = None
    is_deleted: bool = False


class ConversationFilterOptionsResponse(BaseModel):
    """会话审计用户与 Agent 筛选项。"""

    users: list[ConversationFilterOption]
    agents: list[ConversationFilterOption]


class ConversationDetailResponse(BaseModel):
    """Dashboard 对话详情。"""

    thread_id: str
    uid: str
    username: str | None = None
    user_avatar: str | None = None
    user_deleted: bool = False
    agent_id: str
    agent_name: str | None = None
    agent_avatar: str | None = None
    agent_deleted: bool = False
    title: str | None
    status: str
    is_pinned: bool = False
    message_count: int
    created_at: str
    updated_at: str
    total_tokens: int
    messages: list[dict]


class FeedbackListItem(BaseModel):
    """反馈列表项。"""

    id: int
    uid: str
    username: str | None
    avatar: str | None
    rating: str
    reason: str | None
    created_at: str
    message_content: str
    conversation_title: str | None
    agent_id: str


class TimeSeriesStats(BaseModel):
    """时间序列统计数据。"""

    data: list[dict]
    categories: list[str]
    total_count: int
    average_count: float
    peak_count: int
    peak_date: str
    agent_names: dict[str, str] | None = None


class ThreadSummary(BaseModel):
    """会话汇总指标。"""

    total_threads: int
    active_threads: int
    total_messages: int
    total_tokens: int
    avg_messages_per_thread: float
    avg_tokens_per_thread: float
    pinned_threads: int = 0


class ThreadDailyTrend(BaseModel):
    """每日会话趋势。"""

    date: str
    new_threads: int
    active_threads: int
    message_count: int


class ThreadAgentStat(BaseModel):
    """智能体会话分布指标。"""

    agent_id: str
    agent_name: str
    thread_count: int
    message_count: int
    token_count: int
    avg_messages: float
    agent_avatar: str | None = None


class ThreadUserStat(BaseModel):
    """高频用户统计项。"""

    uid: str
    username: str | None
    avatar: str | None
    thread_count: int
    message_count: int
    last_active_at: str | None


class ThreadAnalyticsResponse(BaseModel):
    """会话多维分析响应模型。"""

    summary: ThreadSummary
    daily_trends: list[ThreadDailyTrend]
    depth_distribution: dict[str, int]
    agent_distribution: list[ThreadAgentStat]
    top_users: list[ThreadUserStat]
    status_distribution: dict[str, int]


class FeedbackSatisfactionStats(BaseModel):
    """反馈满意度统计；字段对齐 `DashboardRepository.get_basic_stats`。"""

    total_feedbacks: int
    satisfaction_rate: float


class BasicStatsResponse(BaseModel):
    """Dashboard 基础统计响应。"""

    total_conversations: int
    active_conversations: int
    total_messages: int
    total_users: int
    feedback_stats: FeedbackSatisfactionStats


@dashboard.get("/stats", response_model=BasicStatsResponse, response_model_exclude_unset=True)
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_superadmin_user),
):
    """获取基础统计指标（超级管理员权限）。"""
    return await DashboardService(db).get_basic_stats()


@dashboard.get("/stats/users", response_model=UserActivityStats)
async def get_user_activity_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_superadmin_user),
):
    """获取用户活动统计（超级管理员权限）。"""
    return UserActivityStats(**await DashboardService(db).get_user_activity_stats())


@dashboard.get("/stats/tools", response_model=ToolCallStats)
async def get_tool_call_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_superadmin_user),
):
    """获取工具调用统计（超级管理员权限）。"""
    return ToolCallStats(**await DashboardService(db).get_tool_call_stats())


@dashboard.get("/stats/agents", response_model=AgentAnalytics)
async def get_agent_analytics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_superadmin_user),
):
    """获取智能体分析（超级管理员权限）。"""
    return AgentAnalytics(**await DashboardService(db).get_agent_analytics())


@dashboard.get("/stats/calls/timeseries", response_model=TimeSeriesStats)
async def get_call_timeseries_stats(
    type: Literal["models", "agents", "tokens", "tools"] = "models",
    time_range: Literal["14hours", "14days", "14weeks"] = "14days",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_superadmin_user),
):
    """获取调用分析时间序列统计（超级管理员权限）。"""
    data = await DashboardService(db).get_call_timeseries(
        metric_type=type,
        time_range=time_range,
    )
    return TimeSeriesStats(**data)


@dashboard.get("/stats/threads", response_model=ThreadAnalyticsResponse)
async def get_thread_analytics_stats(
    time_range: Literal["7days", "14days", "30days", "90days"] = "30days",
    agent_id: str | None = None,
    include_subagents: bool = Query(False, description="是否将子智能体会话纳入统计"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_superadmin_user),
):
    """获取会话多维分析统计（超级管理员权限）。"""
    data = await DashboardService(db).get_thread_analytics(
        time_range=time_range,
        agent_id=agent_id,
        include_subagents=include_subagents,
    )
    return ThreadAnalyticsResponse(**data)


@dashboard.get("/feedbacks", response_model=list[FeedbackListItem])
async def get_all_feedbacks(
    rating: str | None = None,
    agent_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_superadmin_user),
):
    """获取所有反馈记录（超级管理员权限）。"""
    return await DashboardService(db).get_feedbacks(rating=rating, agent_id=agent_id)


@dashboard.get("/conversations/options", response_model=ConversationFilterOptionsResponse)
async def get_conversation_filter_options(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_superadmin_user),
):
    """获取会话审计用户与 Agent 筛选项（超级管理员权限）。"""
    return await DashboardService(db).get_conversation_filter_options()


@dashboard.get("/conversations", response_model=ConversationListResponse)
async def get_all_conversations(
    uid: str | None = None,
    agent_id: str | None = None,
    status: Literal["active", "archived", "deleted", "subagent", "all"] = "all",
    search: Annotated[str | None, Query(max_length=255)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_superadmin_user),
):
    """获取所有对话（超级管理员权限）。"""
    return await DashboardService(db).list_conversations(
        uid=uid,
        agent_id=agent_id,
        status=status,
        search=search,
        limit=limit,
        offset=offset,
    )


@dashboard.get("/conversations/{thread_id}", response_model=ConversationDetailResponse)
async def get_conversation_detail(
    thread_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_superadmin_user),
):
    """获取指定对话详情（超级管理员权限）。"""
    data = await DashboardService(db).get_conversation_detail(thread_id)
    if not data:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return data
