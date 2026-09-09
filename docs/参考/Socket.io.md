# Socket.IO

## 为什么不用 ws

FastAPI 已经可以直接使用 WebSocket。fba 仍然集成 Socket.IO，是因为它在事件模型、自动重连、房间、广播和客户端生态方面提供了更完整的封装。对于需要实时通知、任务进度推送等场景，Socket.IO 可以减少大量自定义协议和连接管理代码

## 什么是 Socket.IO？

Socket.IO 是一套基于事件的实时双向通信方案，可以在客户端和服务器之间传递事件消息

## 使用对比

### 没有 Socket.IO 时

你的 leader 在出差，给你任命了一项非常着急的任务，这项任务就等同于事件，但你并不能很快的完成此任务，可是你的 leader 过一会儿就会问你怎么样了（轮询），你很烦，不想理他（延迟反应）

### 使用 Socket.IO 时

你的 leader 就坐在你的旁边，你的工作效率飞升，马上就完成了任务，并且直接口头传达了完成，他立马就听见了（实时）

## 集成

可以在 `backend/common/socketio/` 目录下查看 Socket.IO 的本地实现，其中包含两个文件

- `actions.py`：此文件主要用于定义一些全局事件，方便我们对事件进行统一管理
- `server.py`：此文件是在 fba 中的服务端标准实现，其中包含 Socket.IO 授权连接

但这些并不是主要集成代码。你可以进入 `backend/core/registrar.py` 文件，找到以下方法

```python
def register_socket_app(app: FastAPI) -> None:
    """
    socket 应用

    :param app:
    :return:
    """
    from backend.src.common.socketio.server import sio

    socket_app = socketio.ASGIApp(
        socketio_server=sio,
        other_asgi_app=app,
        # 切勿删除此配置：https://github.com/pyropy/fastapi-socketio/issues/51
        socketio_path='/ws/socket.io',
    )
    app.mount('/ws', socket_app)
```

这里通过 python-socketio 创建 ASGI 应用，并把 Socket.IO 服务端实例和 FastAPI 应用传入。随后使用 FastAPI 的 `mount()` 方法将 Socket.IO 应用挂载到 `/ws`，完成实时通信能力集成。
