# Standard library imports
import io
import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

from dotenv import load_dotenv

load_dotenv()

# Constants
GOOGLE_DRIVE_FOLDER = os.getenv("GOOGLE_DRIVE_FOLDER")
GOOGLE_DRIVE_CREDENTIALS_PATH = os.getenv("GOOGLE_DRIVE_CREDENTIALS_PATH")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class GoogleDriveLoader:
    """Handles authentication and file downloading from Google Drive using service account"""

    SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]
    DOWNLOAD_DIR = GOOGLE_DRIVE_FOLDER

    # Map of Google Workspace MIME types to export formats
    EXPORT_FORMATS = {
        "application/vnd.google-apps.document": {
            "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "extension": ".docx",
        },
        "application/vnd.google-apps.spreadsheet": {
            "mime_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "extension": ".xlsx",
        },
        "application/vnd.google-apps.presentation": {
            "mime_type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "extension": ".pptx",
        },
    }

    # Map of common MIME types to file extensions
    MIME_TO_EXTENSION = {
        "application/pdf": ".pdf",
        "text/plain": ".txt",
        "image/jpeg": ".jpg",
        "image/png": ".png",
        **{k: v["extension"] for k, v in EXPORT_FORMATS.items()},
    }

    def __init__(self, credentials_path: Optional[str] = None) -> None:
        """Initialize Google Drive loader"""
        self.credentials_path = credentials_path or GOOGLE_DRIVE_CREDENTIALS_PATH
        if self.credentials_path is None:
            raise FileNotFoundError("Google Drive credentials not configured")
        if not Path(self.credentials_path).exists():
            raise FileNotFoundError(
                f"Service account credentials not found at {self.credentials_path}. "
                "Please follow the setup instructions in the README to configure Google Drive integration."
            )

        # Ensure download directory exists
        Path(self.DOWNLOAD_DIR).mkdir(parents=True, exist_ok=True)
        self._service = None

    @lru_cache(maxsize=1)
    def authenticate(self):
        """Handle Google Drive authentication using service account with caching"""
        if self._service:
            return self._service

        try:
            credentials = service_account.Credentials.from_service_account_file(
                self.credentials_path, scopes=self.SCOPES
            )
            self._service = build("drive", "v3", credentials=credentials)
            return self._service
        except Exception as e:
            raise Exception(f"Authentication failed: {str(e)}")

    def _get_export_request(self, service, file_id: str, mime_type: str):
        """Get appropriate export request based on file type"""
        if mime_type in self.EXPORT_FORMATS:
            return service.files().export_media(
                fileId=file_id, mimeType=self.EXPORT_FORMATS[mime_type]["mime_type"]
            )
        return service.files().get_media(fileId=file_id)

    def _get_unique_path(self, base_path: str) -> str:
        """Generate unique file path to avoid overwrites"""
        if not Path(base_path).exists():
            return base_path

        base_dir = Path(base_path).parent
        base_name = Path(base_path).stem
        extension = Path(base_path).suffix
        counter = 1

        while True:
            new_path = base_dir / f"{base_name}_{counter}{extension}"
            if not new_path.exists():
                return str(new_path)
            counter += 1

    def download_file(self, file_id: str, save_path: Optional[str] = None) -> str:
        """Download a file from Google Drive"""
        service = self.authenticate()

        try:
            file_metadata = service.files().get(fileId=file_id).execute()
            file_name = file_metadata["name"]
            mime_type = file_metadata["mimeType"]

            if mime_type.startswith("application/vnd.google-apps."):
                if mime_type not in self.EXPORT_FORMATS:
                    raise ValueError(
                        f"Unsupported Google Workspace file type: {mime_type}"
                    )
                file_name += self.EXPORT_FORMATS[mime_type]["extension"]

            request = self._get_export_request(service, file_id, mime_type)
            file_handle = io.BytesIO()
            downloader = MediaIoBaseDownload(file_handle, request)

            # Download with progress tracking
            done = False
            while not done:
                status, done = downloader.next_chunk()
                logger.info("Download %d%% completed", int(status.progress() * 100))

            save_path = save_path or self._get_unique_path(
                os.path.join(self.DOWNLOAD_DIR, file_name)
            )
            Path(save_path).parent.mkdir(parents=True, exist_ok=True)

            with open(save_path, "wb") as f:
                f.write(file_handle.getvalue())

            logger.info("Saved file to: %s", save_path)
            return save_path

        except Exception as e:
            raise Exception(f"Error downloading file from Google Drive: {str(e)}")

    def list_files_in_folder(self, folder_id: str) -> List[Dict[str, str]]:
        """List all files in a Google Drive folder recursively"""
        service = self.authenticate()
        all_files = []

        def list_files_recursive(folder_id: str):
            try:
                results = (
                    service.files()
                    .list(
                        q=f"'{folder_id}' in parents and trashed=false",
                        fields="files(id, name, mimeType)",
                        pageSize=1000,
                    )
                    .execute()
                )

                for file in results.get("files", []):
                    if file["mimeType"] == "application/vnd.google-apps.folder":
                        list_files_recursive(file["id"])
                    else:
                        all_files.append(file)
            except Exception as e:
                raise Exception(f"Error listing files: {str(e)}")

        list_files_recursive(folder_id)
        return all_files

    def download_single_file(self, file_id: str, save_dir: Optional[str] = None) -> str:
        """Download a single file from Google Drive"""
        save_dir = save_dir or self.DOWNLOAD_DIR
        Path(save_dir).mkdir(parents=True, exist_ok=True)

        try:
            service = self.authenticate()
            file = (
                service.files()
                .get(fileId=file_id, fields="id, name, mimeType")
                .execute()
            )

            file_name = file["name"]
            mime_type = file["mimeType"]
            extension = Path(file_name).suffix or self.MIME_TO_EXTENSION.get(
                mime_type, ""
            )

            save_path = Path(save_dir) / f"{Path(file_name).stem}{extension}"
            return self.download_file(file_id, str(save_path))

        except Exception as e:
            logger.error("Error downloading file (ID: %s): %s", file_id, str(e))
            raise Exception(f"Error downloading file from Google Drive: {str(e)}")
