import os
import sys
from pathlib import Path

# Add project root to Python path
project_root = str(Path(__file__).parent.parent.parent)
sys.path.append(project_root)

from src.ingestion.google_drive import GoogleDriveLoader
import logging
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main():
    """
    Main function to test the Google Drive loader functionality with recursive folder processing.
    """
    load_dotenv()
    try:
        loader = GoogleDriveLoader()
        folder_id = os.getenv("GOOGLE_DRIVE_FOLDER_ID")

        if not folder_id:
            raise ValueError(
                "Google Drive folder ID is not set in the environment variables."
            )

        logger.info("Starting recursive download...")
        downloaded_files = loader.download_all_files_recursively(folder_id)
        logger.info("\nDownloaded files:")
        for file_path in downloaded_files:
            logger.info("- %s", file_path)
    except Exception as e:
        logger.error("Test failed: %s", e)


if __name__ == "__main__":
    main()
