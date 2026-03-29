from pathlib import Path


def init_project():
    """Initialize project directory structure and packages"""
    # Create package directories
    packages = [
        "RAG_M/src",
        "RAG_M/src/api",
        "RAG_M/src/ingestion",
        "RAG_M/src/vectorstore",
        "RAG_M/src/rag",
        "RAG_M/src/models",
    ]

    print("Creating project directories...")
    print("Packages created:", packages)

    # Create __init__.py files
    for package in packages:
        Path(package).mkdir(parents=True, exist_ok=True)
        init_file = Path(f"{package}/__init__.py")
        if not init_file.exists():
            init_file.touch()


if __name__ == "__main__":
    init_project()
