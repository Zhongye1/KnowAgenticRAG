import os
import sys
import argparse
from pathlib import Path

# Add project root to Python path
project_root = str(Path(__file__).parent.parent.parent)
sys.path.append(project_root)

from src.ingestion.document_loader import DocumentLoader
from src.vectorstore.vector_store import VectorStoreManager
from dotenv import load_dotenv


def ingest_documents(
    docs_dir: str = None,
    drive_files: list = None,
    drive_folder: str = None,
    google_drive_credentials: str = None,
):
    """
    Ingest documents from local directory and/or Google Drive

    Args:
        docs_dir: Directory containing local documents to ingest
        drive_files: List of Google Drive file IDs to ingest
        drive_folder: Google Drive folder ID to ingest all files from
        google_drive_credentials: Path to Google Drive service account credentials
    """
    load_dotenv()

    # Get vectorstore path from environment
    vectorstore_path = os.getenv("VECTORSTORE_PATH")
    if not vectorstore_path:
        raise ValueError("VECTORSTORE_PATH not set in .env file")

    # Initialize document loader and vector store manager
    # loader = DocumentLoader(google_drive_credentials)
    loader = DocumentLoader(google_drive_credentials)
    vector_store_manager = VectorStoreManager()

    documents = []

    # Process local documents
    if docs_dir:
        for root, _, files in os.walk(docs_dir):
            for file in files:
                file_path = os.path.join(root, file)
                try:
                    print(f"Processing local file: {file_path}")
                    docs = loader.load_document(file_path)
                    documents.extend(docs)
                except Exception as e:
                    print(f"Error processing {file_path}: {str(e)}")

    # Process Google Drive files
    if drive_files:
        for file_id in drive_files:
            try:
                print(f"Processing Google Drive file: {file_id}")
                docs = loader.load_document(file_id, is_google_drive=True)
                documents.extend(docs)
            except Exception as e:
                print(f"Error processing Google Drive file {file_id}: {str(e)}")

    # Process Google Drive folder
    if drive_folder:
        try:
            print(f"Processing Google Drive folder: {drive_folder}")
            downloaded_paths = loader.google_drive_loader.download_all_files_in_folder(
                drive_folder
            )
            for path in downloaded_paths:
                try:
                    docs = loader.load_document(path)
                    documents.extend(docs)
                except Exception as e:
                    print(f"Error processing {path}: {str(e)}")
        except Exception as e:
            print(f"Error processing Google Drive folder {drive_folder}: {str(e)}")

    if documents:
        print(f"Creating vector store with {len(documents)} documents")
        print("Final directory check before creating vector store:")
        print(f"Directory exists: {os.path.exists(vectorstore_path)}")
        print(
            f"Directory writable: {os.access(vectorstore_path, os.W_OK) if os.path.exists(vectorstore_path) else False}"
        )
        print(
            f"Directory contents: {os.listdir(vectorstore_path) if os.path.exists(vectorstore_path) else 'Directory does not exist'}"
        )

        print(f"Creating vector store with {len(documents)} document chunks")
        print(f"data: Creating vector store with {len(documents)} document chunks\n\n")
        try:
            vector_store_manager.create_vectorstore(documents, vectorstore_path)
            print(f"Vector store successfully created and saved to {vectorstore_path}")
            yield f"data: Vector store successfully created and saved to {vectorstore_path}\n\n"
        except Exception as e:
            print(f"Error creating vector store: {str(e)}")
            yield f"data: ERROR creating vector store: {str(e)}\n\n"
            raise
    else:
        print("No documents were processed successfully")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Ingest documents into the vector store"
    )
    parser.add_argument(
        "--docs-dir", help="Directory containing local documents to ingest"
    )
    parser.add_argument(
        "--drive-files", nargs="+", help="Google Drive file IDs to ingest"
    )
    parser.add_argument(
        "--drive-folder", help="Google Drive folder ID to ingest all files from"
    )
    parser.add_argument(
        "--google-drive-credentials",
        help="Path to Google Drive service account credentials",
    )
    args = parser.parse_args()

    if not args.docs_dir and not args.drive_files and not args.drive_folder:
        parser.error(
            "At least one of --docs-dir, --drive-files, or --drive-folder must be provided"
        )

    ingest_documents(
        args.docs_dir,
        args.drive_files,
        args.drive_folder,
        args.google_drive_credentials,
    )
