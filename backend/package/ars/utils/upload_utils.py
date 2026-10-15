from pathlib import Path

import aiofiles
from fastapi import UploadFile

MAX_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024


async def write_upload_to_buffer(
    upload: UploadFile,
    buffer,
    *,
    max_size_bytes: int,
    too_large_message: str,
    chunk_size: int = 1024 * 1024,
) -> int:
    await upload.seek(0)
    written = 0

    while chunk := await upload.read(chunk_size):
        written += len(chunk)
        if written > max_size_bytes:
            raise ValueError(too_large_message)
        await buffer.write(chunk)

    return written


async def read_upload_with_limit(
    upload: UploadFile,
    *,
    max_size_bytes: int,
    too_large_message: str,
    chunk_size: int = 1024 * 1024,
) -> bytes:
    await upload.seek(0)
    written = 0
    chunks: list[bytes] = []

    while chunk := await upload.read(chunk_size):
        written += len(chunk)
        if written > max_size_bytes:
            raise ValueError(too_large_message)
        chunks.append(chunk)

    return b"".join(chunks)


async def write_upload_to_path(
    upload: UploadFile,
    dest: Path,
    *,
    max_size_bytes: int,
    too_large_message: str,
    mode: str = "wb",
    chunk_size: int = 1024 * 1024,
) -> int:
    async with aiofiles.open(dest, mode) as buffer:
        return await write_upload_to_buffer(
            upload,
            buffer,
            max_size_bytes=max_size_bytes,
            too_large_message=too_large_message,
            chunk_size=chunk_size,
        )
