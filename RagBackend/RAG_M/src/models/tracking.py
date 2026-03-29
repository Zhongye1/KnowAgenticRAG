from pathlib import Path
import tempfile
import shutil
from datetime import datetime
from typing import Optional, Dict, List
from pydantic import BaseModel


class DocumentTrack(BaseModel):
    """Track document ingestion status"""

    file_path: str
    file_id: Optional[str] = None
    status: str
    timestamp: datetime
    error: Optional[str] = None
    metadata: Optional[Dict] = None
    vectorized: bool = False
    vectorized_at: Optional[datetime] = None


class IngestionTracker:
    """Manage document ingestion tracking"""

    def __init__(self, tracking_file: str = "data/tracking/ingestion_log.jsonl"):
        self.tracking_file = Path(tracking_file)
        self._ensure_tracking_dir()
        self._history_cache: Optional[List[DocumentTrack]] = None

    def _ensure_tracking_dir(self):
        """Ensure tracking directory exists"""
        self.tracking_file.parent.mkdir(parents=True, exist_ok=True)

    def track(self, document: DocumentTrack):
        """Add tracking entry"""
        with open(self.tracking_file, "a") as f:
            f.write(document.json() + "\n")
        # Invalidate cache
        self._history_cache = None

    def update_vectorization_status(
        self, file_path: str, success: bool = True, error: str = None
    ):
        """Update vectorization status for a document"""
        if not self.tracking_file.exists():
            return

        temp_file = tempfile.NamedTemporaryFile(mode="w", delete=False)
        updated = False
        now = datetime.now()

        try:
            with open(self.tracking_file, "r") as f:
                for line in f:
                    if line.strip():
                        track = DocumentTrack.parse_raw(line)
                        if track.file_path == file_path:
                            track.vectorized = success
                            track.vectorized_at = now
                            if error:
                                track.error = error
                            updated = True
                        temp_file.write(track.json() + "\n")

            temp_file.close()
            shutil.move(temp_file.name, self.tracking_file)

            if not updated:
                self.track(
                    DocumentTrack(
                        file_path=file_path,
                        status="vectorized" if success else "failed",
                        timestamp=now,
                        vectorized=success,
                        vectorized_at=now if success else None,
                        error=error,
                    )
                )
        finally:
            if Path(temp_file.name).exists():
                Path(temp_file.name).unlink()
            # Invalidate cache
            self._history_cache = None

    def get_history(self) -> List[DocumentTrack]:
        """Get ingestion history with caching"""
        if self._history_cache is not None:
            return self._history_cache

        if not self.tracking_file.exists():
            self._history_cache = []
            return []

        tracks = []
        with open(self.tracking_file) as f:
            for line in f:
                if line.strip():
                    tracks.append(DocumentTrack.parse_raw(line))
        self._history_cache = tracks
        return tracks

    def get_vectorized_files(self) -> List[str]:
        """Get list of files that have been vectorized"""
        return [track.file_path for track in self.get_history() if track.vectorized]

    def get_failed_files(self) -> List[str]:
        """Get list of files that failed vectorization"""
        return [
            track.file_path
            for track in self.get_history()
            if not track.vectorized and track.status == "failed"
        ]

    def is_file_vectorized(self, file_id: str) -> bool:
        """
        Check if a file has already been vectorized

        Args:
            file_id: Google Drive file ID

        Returns:
            bool: True if file is already vectorized, False otherwise
        """
        return any(
            track.file_id == file_id and track.vectorized
            for track in self.get_history()
        )

    def get_vectorized_file_ids(self) -> List[str]:
        """Get list of file IDs that have been vectorized"""
        return [
            track.file_id
            for track in self.get_history()
            if track.vectorized and track.file_id is not None
        ]
