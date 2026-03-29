import logging
import os
from datetime import datetime
from typing import List

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel

from src.ingestion.google_drive import GoogleDriveLoader
from src.ingestion.document_loader import DocumentLoader
from src.vectorstore.vector_store import VectorStoreManager
from src.models.tracking import IngestionTracker, DocumentTrack

# Load environment variables and configure logging
load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize router and tracker
router = APIRouter()
tracker = IngestionTracker()


class DriveFileRequest(BaseModel):
    """Request model for Drive file ingestion"""

    folder_id: str


class DriveIngestionResponse(BaseModel):
    """Response model for Drive ingestion endpoints"""

    status: str
    message: str
    files_processed: List[str]


async def process_single_file(
    file_id: str,
    file_name: str,
    drive_loader: GoogleDriveLoader,
    doc_loader: DocumentLoader,
) -> tuple[List, str]:
    """Process a single file and return its documents and downloaded path"""
    downloaded_path = drive_loader.download_single_file(file_id)

    tracker.track(
        DocumentTrack(
            file_path=downloaded_path,
            file_id=file_id,
            status="downloaded",
            timestamp=datetime.now(),
        )
    )

    docs = doc_loader.load_document(downloaded_path)
    tracker.update_vectorization_status(downloaded_path, success=True)

    return docs, downloaded_path


@router.post("/ingest/drive/files", response_model=DriveIngestionResponse)
async def ingest_drive_files(
    request: DriveFileRequest = Body(...),
) -> DriveIngestionResponse:
    """Ingest files from Google Drive folder"""
    drive_loader = GoogleDriveLoader()
    doc_loader = DocumentLoader()
    vector_store_manager = VectorStoreManager()
    processed_files = []
    documents = []

    try:
        files = drive_loader.list_files_in_folder(request.folder_id)
    except Exception as e:
        logger.error("Error listing files in folder %s: %s", request.folder_id, str(e))
        raise HTTPException(status_code=500, detail="Failed to list files in folder")

    for file in files:
        file_id = file.get("id")
        file_name = file.get("name")

        if tracker.is_file_vectorized(file_id):
            logger.info("File %s already vectorized, skipping", file_name)
            continue

        try:
            new_docs, downloaded_path = await process_single_file(
                file_id, file_name, drive_loader, doc_loader
            )
            documents.extend(new_docs)
            processed_files.append(downloaded_path)
            os.remove(downloaded_path)  # Clean up downloaded file

        except Exception as e:
            error_msg = f"Error processing file {file_name}: {str(e)}"
            logger.error(error_msg)
            tracker.update_vectorization_status(
                downloaded_path, success=False, error=str(e)
            )
            raise HTTPException(status_code=500, detail=error_msg)

    if not processed_files:
        message = (
            "No new files to process"
            if tracker.get_vectorized_file_ids()
            else "No files processed successfully"
        )
        raise HTTPException(status_code=400, detail=message)

    if documents:
        try:
            vector_store_manager.create_vectorstore(
                documents, os.getenv("VECTORSTORE_PATH")
            )
        except Exception as e:
            logger.error("Error updating vector store: %s", str(e))
            raise HTTPException(status_code=500, detail="Failed to update vector store")

    return DriveIngestionResponse(
        status="success",
        message=f"Successfully processed {len(processed_files)} files",
        files_processed=processed_files,
    )
