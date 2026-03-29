# 用户管理

KnowledgeRAG 提供完整的用户认证和管理系统，支持多种登录方式和权限控制。

## 用户认证

### 登录方式

系统支持多种登录方式：

#### 1. 标准用户名密码登录

- **注册**：使用邮箱和密码注册账号
- **登录**：输入邮箱和密码登录
- **JWT Token**：登录后获得 7 天有效期的 Token

#### 2. QQ 第三方登录

- **OAuth2.0**：基于 QQ 开放平台的 OAuth2.0 授权
- **一键登录**：无需注册，直接使用 QQ 账号登录
- **账号绑定**：可绑定到现有账号或创建新账号

### 注册流程

```
1. 进入登录/注册页面（/LogonOrRegister）
2. 切换到"注册"标签
3. 输入邮箱地址
4. 设置密码（建议包含大小写字母、数字和特殊字符）
5. 确认密码
6. 点击"注册"按钮
7. 注册成功后自动登录
```

### 登录流程

```
1. 打开登录页面
2. 输入邮箱和密码
3. 点击"登录"按钮
4. 后端验证凭据
5. 生成 JWT Token
6. 返回用户信息和 Token
7. 前端存储 Token 到 localStorage
8. 跳转到首页
```

## 密码重置

如果忘记密码，可以通过邮箱验证码重置：

### 操作步骤

1. 在登录页面点击"忘记密码"
2. 输入注册邮箱
3. 点击"发送验证码"
4. 查收邮件获取 6 位数字验证码
5. 输入验证码
6. 设置新密码
7. 确认新密码
8. 完成重置

### 安全机制

- **验证码有效期**：5 分钟
- **最大重试次数**：5 次
- **SMTP 发送**：通过 QQ 邮箱 SMTP 服务发送
- **内存存储**：验证码临时存储在内存中

## 个人中心

### 查看个人信息

访问 `/user` 或 `/user/userInfo` 查看：

- **头像**：用户头像图片
- **昵称**：显示的昵称
- **签名**：个人签名
- **邮箱**：注册邮箱
- **注册时间**：账号创建时间

### 更新个人资料

可以修改以下信息：

#### 修改昵称和签名

1. 进入个人中心
2. 点击"编辑资料"
3. 修改昵称和签名
4. 点击"保存"提交
5. 接口：`POST /api/UpdateUserData`

#### 上传头像

1. 点击头像区域
2. 选择本地图片文件
3. 裁剪和调整（可选）
4. 确认上传
5. 接口：`POST /api/UpdateUserData`（FormData 格式）
6. 存储位置：`user_avatars/` 目录

### 账号安全

#### 修改密码

1. 进入"账号安全"设置
2. 输入当前密码
3. 输入新密码
4. 确认新密码
5. 提交修改

#### 绑定 QQ 账号

1. 进入"第三方绑定"
2. 点击"绑定 QQ"
3. 扫码授权
4. 完成绑定

#### 解绑 QQ 账号

1. 确保已设置密码
2. 进入"第三方绑定"
3. 点击"解绑"
4. 确认解绑操作

## 权限控制

### 基于角色的访问控制（RBAC）

系统实现三级角色体系：

| 角色 | 权限 | 说明 |
|------|------|------|
| **管理员** | 完全控制 | 管理所有用户和知识库 |
| **普通用户** | 自主管理 | 创建和管理自己的知识库 |
| **访客** | 只读 | 仅能浏览公开知识库 |

### 知识库权限

每个知识库可以独立设置权限：

#### 个人知识库 🔒

- 仅创建者可见
- 完全私密
- 默认权限类型

#### 共享知识库 👥

- 团队成员可见
- 可设置成员角色：
  - **管理员**（最多 5 名）：完全控制
  - **编辑者**（无限制）：读写权限
  - **查看者**（无限制）：只读权限

#### 广场知识库 🌐

- 所有用户可见
- 公开分享
- 用于知识传播

### 安全策略

针对共享知识库的安全措施：

- **加入审批**：新成员需管理员审核
- **禁止导出**：禁止非管理员下载文件
- **添加水印**：导出内容自动添加水印
- **只读模式**：可设置全员只读

## JWT 认证机制

### Token 生成

```python
# 后端生成 JWT Token
import jwt
import datetime

def generate_token(user_id, email):
    payload = {
        'user_id': user_id,
        'email': email,
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7),
        'iat': datetime.datetime.utcnow()
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm='HS256')
    return token
```

### Token 验证

每次导航时路由守卫自动验证：

```javascript
// 前端路由守卫
router.beforeEach(async (to, from, next) => {
  const token = localStorage.getItem('token');

  if (!token && to.path !== '/LogonOrRegister') {
    next('/LogonOrRegister?redirect=' + to.fullPath);
    return;
  }

  try {
    // 调用后端验证 Token
    const response = await axios.get('/api/users/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    next();
  } catch (error) {
    // Token 无效，清除并重定向
    localStorage.removeItem('token');
    next('/LogonOrRegister?redirect=' + to.fullPath);
  }
});
```

### Token 刷新

- **有效期**：7 天
- **自动刷新**：接近过期时自动刷新（待实现）
- **手动刷新**：重新登录获取新 Token

## 用户数据模型

### 数据库表结构

```sql
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nickname VARCHAR(100),
    avatar_url VARCHAR(500),
    signature TEXT,
    qq_openid VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### 密码加密

使用 SHA-256 哈希存储：

```python
import hashlib

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()
```

## API 接口

### 用户注册

```http
POST /api/login/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure_password"
}
```

### 用户登录

```http
POST /api/login/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure_password"
}

# 响应
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "nickname": "User"
  }
}
```

### 验证 Token

```http
GET /api/users/me
Authorization: Bearer YOUR_TOKEN
```

### 获取用户信息

```http
GET /api/user/GetUserData
Authorization: Bearer YOUR_TOKEN
```

### 更新用户信息

```http
POST /api/UpdateUserData
Authorization: Bearer YOUR_TOKEN
Content-Type: multipart/form-data

FormData:
  nickname: "新昵称"
  signature: "新签名"
  avatar: [文件]
```

### QQ 登录

```http
POST /api/qq/login
Content-Type: application/json

{
  "code": "QQ_AUTH_CODE"
}
```

### 发送验证码

```http
POST /api/reset/send-code
Content-Type: application/json

{
  "email": "user@example.com"
}
```

### 重置密码

```http
POST /api/reset/verify-code
Content-Type: application/json

{
  "email": "user@example.com",
  "code": "123456",
  "new_password": "new_secure_password"
}
```

## 最佳实践

### 账号安全

1. **强密码**：使用包含大小写字母、数字和特殊字符的密码
2. **定期更换**：建议每 3-6 个月更换一次密码
3. **不泄露**：不要将密码告知他人
4. **绑定手机/QQ**：增加找回账号的途径

### 隐私保护

1. **谨慎分享**：不要随意分享个人知识库
2. **权限设置**：根据内容敏感度选择合适的可见性
3. **成员管理**：定期审查共享知识库的成员列表
4. **退出登录**：在公共设备上使用后及时退出

### 使用技巧

1. **完善资料**：设置头像和昵称便于识别
2. **个性化签名**：展示个人或团队特色
3. **利用收藏**：星标重要知识库
4. **历史记录**：善用历史记录功能快速定位

## 常见问题

### Q: 收不到验证码邮件？

A: 检查以下几点：
- 检查垃圾邮件箱
- 确认邮箱地址正确
- 等待 1-2 分钟
- 如仍收不到，联系管理员

### Q: Token 过期了怎么办？

A:
- 系统会自动检测到期并重定向到登录页
- 重新登录即可获得新 Token
- 下次登录时可勾选"记住我"（如实现）

### Q: 如何解除 QQ 绑定？

A:
- 确保已设置密码
- 进入个人中心的"第三方绑定"
- 点击"解绑"并确认

### Q: 忘记原密码如何修改？

A:
- 使用密码重置功能
- 通过邮箱验证码重置
- 重置后使用新密码登录
