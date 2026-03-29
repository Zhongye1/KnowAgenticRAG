import os
import requests
import json
from langchain_community.document_loaders import PyPDFLoader
from docx import Document
from pathlib import Path
import re

# Constants
OLLAMA_API_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "qwen3:0.6b"
CHUNK_SIZE = 5000
PROJECT_ROOT = Path(__file__).resolve().parent.parent
KNOWLEDGE_BASE_PATH = os.path.join(PROJECT_ROOT, "test")


# Split text into chunks
def split_text_into_chunks(text, chunk_size):
    return [text[i : i + chunk_size] for i in range(0, len(text), chunk_size)]


# Extract text from PDF
def extract_pdf_text(file_path):
    try:
        loader = PyPDFLoader(file_path)
        documents = loader.load()
        text = "\n".join([doc.page_content for doc in documents])
        return text
    except Exception as e:
        print(f"Unable to extract PDF file {file_path}: {e}")
        return ""


# Extract text from DOC/DOCX
def extract_doc_text(file_path):
    try:
        doc = Document(file_path)
        text = "\n".join([para.text for para in doc.paragraphs])
        return text
    except Exception as e:
        print(f"Unable to extract DOC file {file_path}: {e}")
        return ""


# Extract text from text files
def extract_text_file(file_path):
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        print(f"Unable to read file {file_path}: {e}")
        return ""


# Extract text based on file type
def extract_text(file_path):
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".pdf":
        return extract_pdf_text(file_path)
    elif ext in [".doc", ".docx"]:
        return extract_doc_text(file_path)
    elif ext in [".txt", ".md"]:
        return extract_text_file(file_path)
    else:
        print(f"Unsupported file type: {ext}")
        return ""


# Extract graph data using Ollama API
def extract_graph_data(chunk):
    prompt = f"""
    Provide meaningful attributes for every entity to add context and depth.
    Important: Use exact text from the input for extraction_text. Do not paraphrase.
    Extract entities in order of appearance with no overlapping text spans.
From the following text, extract nodes (entities such as people, places) and edges (relationships between entities, such as "mentioned" or "interacted").
Output in JSON format with 'nodes' and 'edges' fields:
- nodes: List of objects with 'id' (unique identifier) and 'label' (entity name).
- edges: List of objects with 'source' (source node id), 'target' (target node id), and 'label' (relationship description).
- 输出：所有内容使用中文输出
Example output:
{{
  "nodes": [{{"id": "entity1", "label": "Entity 1"}}, {{"id": "entity2", "label": "Entity 2"}}],
  "edges": [{{"source": "entity1", "target": "entity2", "label": "mentioned"}}]
}}
Text: {chunk}
"""
    data = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,  # Ensure full response is returned
    }
    try:
        response = requests.post(OLLAMA_API_URL, json=data, timeout=30)
        print(f"API request status code: {response.status_code}")
        if response.status_code == 200:
            result = response.json()
            generated_text = result.get("response", "")
            print(
                f"API response: {generated_text[:100]}..."
            )  # Print first 100 characters

            # Attempt to extract JSON from the response using regex
            json_pattern = r"(\{.*\})"
            match = re.search(json_pattern, generated_text, re.DOTALL)
            if match:
                json_str = match.group(1).strip()
                try:
                    parsed_json = json.loads(json_str)
                    if "nodes" in parsed_json and "edges" in parsed_json:
                        return parsed_json
                    else:
                        print(
                            "Warning: JSON does not contain 'nodes' and 'edges' keys."
                        )
                        return {"nodes": [], "edges": []}
                except json.JSONDecodeError:
                    print(f"Failed to parse extracted JSON: {json_str[:50]}...")
                    return {"nodes": [], "edges": []}
            else:
                print("No JSON object found in the response.")
                return {"nodes": [], "edges": []}
        else:
            print(f"API request failed, status code: {response.status_code}")
            return {"nodes": [], "edges": []}
    except Exception as e:
        print(f"API call error: {str(e)}")
        return {"nodes": [], "edges": []}


# Main function to process files
def process_files():
    if not os.path.exists(KNOWLEDGE_BASE_PATH):
        print(f"Directory {KNOWLEDGE_BASE_PATH} does not exist")
        return

    files = [
        f
        for f in os.listdir(KNOWLEDGE_BASE_PATH)
        if os.path.isfile(os.path.join(KNOWLEDGE_BASE_PATH, f))
    ]

    for file in files:
        file_path = os.path.join(KNOWLEDGE_BASE_PATH, file)
        print(f"Processing file: {file}")

        # Extract text
        content = extract_text(file_path)
        if not content:
            print(f"Skipping file {file}, unable to extract content")
            continue

        # Split into chunks
        chunks = split_text_into_chunks(content, CHUNK_SIZE)

        # Extract graph data
        graph_data = {"nodes": [], "edges": []}
        for i, chunk in enumerate(chunks):
            print(f"Processing chunk {i + 1}/{len(chunks)}")
            result = extract_graph_data(chunk)
            if result and "nodes" in result and "edges" in result:
                graph_data["nodes"].extend(result["nodes"])
                graph_data["edges"].extend(result["edges"])
            else:
                print(f"Failed to extract valid graph data for chunk {i + 1}")

        # Save cumulative graph data
        output_file = os.path.join(
            KNOWLEDGE_BASE_PATH, f"{os.path.splitext(file)[0]}_graph.json"
        )
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(graph_data, f, indent=4, ensure_ascii=False)
        print(f"Graph data saved to {output_file}")


# Run the main function
if __name__ == "__main__":
    process_files()
