"""Workspace 文件边界的中立异常。"""


class FileTransferLimitError(ValueError):
    """受信任文件传输超过调用方声明的字节上限。"""
