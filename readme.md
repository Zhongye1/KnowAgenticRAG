## This is @RAGF-01
## 校内科创校赛作品

描述：​​KnowledgeRAG-GZHU​​ 是一个面向智能知识管理的检索增强生成（RAG）系统，集成文档解析、知识库管理、知识图谱生成、向量检索、Ollama模型服务及智能问答核心功能。前端基于 ​​Vue3 + TypeScript​​ 构建交互框架，实现知识组织与问答可视化；后端采用 ​​FastAPI​​ 架构提供高性能服务支持。该系统通过本地知识库与大语言模型协同推理，显著缓解大模型幻觉问题，提升领域知识问答的精确性与可靠性。

---

## 前端

**仓库: https://github.com/Zhongye1/ASF-RAG--GZHU-**

一个基于 Vue 3 和 TDesign 组件库开发的前端，主要提供处理文档解析，知识库管理，知识图谱生成，RAG 检索，Ollama 服务管理，智能问答的UI界面

- **前端框架**：Vue 3 + TypeScript
- **UI 组件库**：TDesign Vue Next
- **构建工具**：Vite
- **CSS 框架**：Tailwind CSS

### 运行（前端）

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```



## 后端

**仓库：https://github.com/Zhongye1/ASF-RAG-backend**

基于 FastAPI  提供服务的 RAG (检索增强生成) 后端服务，用于处理文档解析，知识库管理，知识图谱生成，RAG 检索，向量存储，Ollama 服务管理，智能问答。

### 运行（后端）

```bash
# 创建虚拟环境
python -m venv venv
# 激活虚拟环境
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

#启动fastapi服务
python main.py --host 0.0.0.0 --port 8000 --reload
```






---

### Contributors 📋

*Thanks goes to these wonderful people:*

<table border="1" cellpadding="10" cellspacing="0" width="100%" align="center">
    <tr>
        <td align="center" valign="top">
            <a href="https://github.com/Zhongye1">
                <img src="https://avatars.githubusercontent.com/u/145737758?v=4" alt="Vaibhav" width="100" height="100" border="0" />
                <br />
                <strong>Rosmontis</strong>
                <br />
                <em>GitHub: <a href="https://github.com/Zhongye1">@Zhongye1</a></em>
                <br />
                Contributions: <br>代码 💻 <br>写文档 📖
            </a>
        </td>
        <td align="center" valign="top">
            <a href="https://github.com/ourcx">
                <img src="https://avatars.githubusercontent.com/u/173872687?v=4" alt="褚喧" width="100" height="100" border="0" />
                <br />
                <strong>褚喧</strong>
                <br />
                <em>GitHub: <a href="https://github.com/ourcx">@ourcx</a></em>
                <br />
                Contributions: 正在贡献
            </a>
        </td>
        <td align="center" valign="top">
            <a href="https://github.com/haha-1205">
                <img src="https://avatars.githubusercontent.com/u/222571036?s=400&u=254ac083b4d85e08dc7dee9d186624dfaa031614&v=4" alt="ZXT" width="100" height="100" border="0" />
                <br />
                <strong>ZXT</strong>
                <br />
                <em>GitHub: <a href="https://github.com/haha-1205">@haha-1205</a></em>
                <br />
                Contributions: 贡献
            </a>
        </td>
        <td align="center" valign="top">
            <a href="https://github.com/HJX">
                <img src="https://pica.zhimg.com/80/v2-3293674e35c7d8cf2040db9121bc559c_720w.webp" alt="HJX" width="100" height="100" border="0" />
                <br />
                <strong>HJX</strong>
                <br />
                <em>GitHub: <a href="https://github.com/HJX">@HJX</a></em>
                <br />
                Contributions: 
            </a>
        </td>
        <td align="center" valign="top">
            <a href="https://github.com/z1pperexplorer">
                <img src="https://avatars.githubusercontent.com/u/222624613?s=400&u=3778bd14e4e096302f3677074fe9c07545b18467&v=4" alt="A1r" width="100" height="100" border="0" />
                <br />
                <strong>A1r</strong>
                <br />
                <em>GitHub: <a href="https://github.com/z1pperexplorer">@z1pperexplorer</a></em>
                <br />
                Contributions: Contributing
            </a>
        </td>
    </tr>
</table>



## 详细介绍
### 项目致力于
**减少AI幻觉问题**：通过**知识库文件与本地AI模型的深度结合，系统提供基于事实的精准回答，显著减少传统AI对话中的虚构和错误信息**  
**全链路知识管理**：实现从**文件上传→知识提取→智能检索→精准问答**的完整闭环，确保信息可追溯、可验证  
<img width="1484" height="792" alt="ada3e720cb66156278deb1cd233b6ab2" src="https://github.com/user-attachments/assets/6ef28324-6a99-409d-80b6-1eead40ff167" />

---

##  用户管理模块
### 完善的账户体系
![用户登录](https://s2.loli.net/2025/08/15/TMGSe9cxr3vN5Eq.png)
- **安全注册**：用户名+邮箱双重验证
- **Token认证**：JWT令牌保障操作安全
- **个人中心**：账户信息管理与设置  
  ![个人设置](https://s2.loli.net/2025/08/15/pm1xC9ZjiL2AsJz.png)

---

##  知识库管理
### 全生命周期管理
![知识库列表](https://s2.loli.net/2025/08/15/4VN2MflLPJxDOZn.png)
1. **知识库CRUD**
   - 创建/编辑/删除知识库
   - 封面与描述管理
   - 多维度搜索过滤

2. **文件智能管理**
   - 多格式支持：PDF/DOCX/TXT/PPTX/Excel
   - 文件操作：启用/禁用/批量删除
   - 元数据展示：分块数/上传日期/状态  
     ![文件管理](https://picx.zhimg.com/80/v2-33ffc0b45685f29acdee4b0462597c51_720w.png)

3. **高级检索系统**
   - 跨语言搜索：自动语种检测
   - 混合检索模式：关键词+语义搜索
   - 结果可视化：相似度分数+内容高亮  
     ![检索界面](https://picx.zhimg.com/80/v2-62e0c8025ff9d60e506fae3c59db615f_720w.png?source=d16d100b)

---

##  智能对话系统
### 基于知识库的精准问答
![对话界面](https://s2.loli.net/2025/08/15/9ZPaDoXAUQj4InC.png)
- **防幻觉机制**：答案严格限定在知识库范围内
- **多模型支持**：自由切换本地AI模型
- **深度思考模式**：增强复杂问题处理能力

### 对话管理功能
- **历史持久化**：对话记录云端存储
- **消息操作**：点赞/点踩/重新生成/复制  
  ![对话历史](https://pic4.zhimg.com/v2-213b04b98eeac770e81800390145ce17_r.jpg)
- **流式响应**：实时显示推理过程

---

##  核心支撑模块
### 模型服务管理
![模型管理](https://s2.loli.net/2025/08/15/s7AcPv45NUEDkCm.png)
- 本地模型监控
- 参数动态配置
- 模型下载与更新

### 智能文件管理
![文件中心](https://s2.loli.net/2025/08/15/3HN8kQ12KESnxMj.png)
- 格式自动转换
- 网络文件抓取
- 批量处理操作

### 智能代理系统
- 自动化任务编排
- 定时知识库更新
- 智能内容摘要生成

---

##  导航与系统管理
### 全局导航控制
![导航栏](https://pic2.zhimg.com/80/v2-c49b6d95809145a2e2e39ed97667aca7_720w.webp)
- 多模块快速切换
- 用户菜单管理  
  ![用户菜单](https://pica.zhimg.com/80/v2-886faf9509f6db51b747f7accef5a8aa_720w.webp)
- 系统文档中心

---

##  系统扩展能力
### 高级功能支持
| 功能类别       | 能力描述                     |
|----------------|------------------------------|
| **知识图谱**   | 可视化知识关联网络           |
| **智能代理**   | 自定义任务编排与执行         |
| **API开放**    | RESTful接口集成第三方系统    |


## # 后续开发

1. ~~实现用户认证和权限管理~~
2. ~~添加模型支持和参数配置~~
3. ~~实现文件处理能力，支持更多格式~~
4. ~~知识库管理：完整的知识库 CRUD 操作，支持文件上传、管理和检索测试。~~
5. ~~搜索功能：支持多语言环境下的文档检索，包括自动语言检测。~~
6. ~~分页和批量操作：针对大量文档提供高效的管理界面。~~
7. 实现文档协作功能
8. 打包并支持 docker 部署
9. 其余需求补充





