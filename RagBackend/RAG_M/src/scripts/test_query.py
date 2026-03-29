import os
import sys
from pathlib import Path

# Add project root to Python path
project_root = str(Path(__file__).parent.parent.parent)
sys.path.append(project_root)

from src.rag.rag_pipeline import RAGPipeline
from src.vectorstore.vector_store import VectorStoreManager
from dotenv import load_dotenv


def test_query(query: str):
    """Test the RAG pipeline with a query"""
    load_dotenv()

    # Load vector store
    vector_store_manager = VectorStoreManager()
    vectorstore = vector_store_manager.load_vectorstore(
        os.getenv("VECTORSTORE_PATH"),
        trust_source=True,  # Only use True if you trust the source of the vector store
    )

    # Initialize RAG pipeline
    rag = RAGPipeline(os.getenv("MODEL"), vectorstore)

    # Process query
    try:
        result = rag.process_query(query)
        print(f"\nQuery: {query}")
        print(f"Answer: {result['answer']}")
        print("\nSources:")
        for source in result["sources"]:
            print(f"- {source}")
    except Exception as e:
        print(f"Error: {str(e)}")


if __name__ == "__main__":
    query = input("Enter your query: ")
    test_query(query)
