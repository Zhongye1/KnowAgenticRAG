import os
from pathlib import Path
from dotenv import load_dotenv


def setup_directories():
    """Create necessary directories for the project"""
    load_dotenv()

    # Get vectorstore path from environment
    vectorstore_path = os.getenv("VECTORSTORE_PATH")
    print(f"VECTORSTORE_PATH: {vectorstore_path}")
    if not vectorstore_path:
        raise ValueError("VECTORSTORE_PATH not set in .env file")

    # Create directories
    directories = [
        "data/documents",  # For storing input documents
        "data/documents/drive",  # For storing Google Drive downloads
        vectorstore_path,  # For storing FAISS index
        "logs",  # For logging
        "keys",  # For storing credentials
        "data/tracking",  # For tracking logs
    ]

    for dir_path in directories:
        Path(dir_path).mkdir(parents=True, exist_ok=True)
        print(f"Created directory: {dir_path}")


if __name__ == "__main__":
    setup_directories()
