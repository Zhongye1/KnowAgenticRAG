import requests
from bs4 import BeautifulSoup

from fastapi import APIRouter, HTTPException

from pydantic import BaseModel
from typing import List

from typing import Optional
from datetime import datetime, timedelta

router = APIRouter()


_models_cache: Optional[List[dict]] = None
_cache_timestamp: Optional[datetime] = None
CACHE_DURATION = 1 * 60 * 60  # 1

class OllamaModelInfo(BaseModel):
    name: str
    description: str
    capabilities: List[str]
    sizes: List[str]
    pulls: str
    tags_count: str
    updated: str

class OllamaModelsRequest(BaseModel):
    page_id: int = 1
#    page_size: int = 10

class OllamaModelsResponse(BaseModel):
    models: List[OllamaModelInfo]
    total_count: int
    page_id: int
    page_size: int
    total_pages: int

def is_cache_valid() -> bool:
    """检查缓存是否有效"""
    if _cache_timestamp is None or _models_cache is None:
        return False
    
    elapsed = datetime.now() - _cache_timestamp
    return elapsed.total_seconds() < CACHE_DURATION

def get_cached_models() -> Optional[List[dict]]:
    """获取缓存的模型数据"""
    if is_cache_valid():
        return _models_cache
    return None

def update_cache(models_data: List[dict]) -> None:
    """更新缓存数据"""
    global _models_cache, _cache_timestamp
    _models_cache = models_data
    _cache_timestamp = datetime.now()


@router.post("/api/ollama-models", response_model=OllamaModelsResponse)
async def get_ollama_models(request: OllamaModelsRequest):
    """
    获取Ollama模型列表（支持分页）
    
    请求参数:
    - page_id: 页码（从1开始）
    """
    try:
        result = scrape_ollama_models_with_pagination(
            page_id=request.page_id,
            page_size=6  # 6
        )
        
        return OllamaModelsResponse(**result)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取模型信息失败: {str(e)}")


def scrape_ollama_models_with_pagination(page_id: int = 1, page_size: int = 10):
    """
    爬取Ollama模型信息并支持分页
    
    Args:
        page_id: 页码，从1开始
        page_size: 每页数量
    
    Returns:
        dict: 包含分页信息的模型数据
    """
    model_info_list = scrape_ollama_models()
    
    total_count = len(model_info_list)
    total_pages = (total_count + page_size - 1) // page_size
    
    start_index = (page_id - 1) * page_size
    end_index = start_index + page_size
    
    current_page_models = model_info_list[start_index:end_index]
    
    return {
        "models": current_page_models,
        "total_count": total_count,
        "page_id": page_id,
        "page_size": page_size,
        "total_pages": total_pages
    }



def scrape_ollama_models():
    """
    爬取Ollama模型信息，优先使用缓存
    """
    cached_data = get_cached_models()
    if cached_data is not None:
        print("使用缓存数据")
        return cached_data
    
    print("缓存过期或不存在，重新爬取数据")
    
    url = "https://ollama.com/library"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "lxml")

        # ... ...
        model_list_container = soup.find("ul", {"role": "list", "class": "grid grid-cols-1 gap-y-3"})
        if not model_list_container:
            print("未找到模型列表容器")
            return []

        models = model_list_container.find_all("li")
        model_info_list = []

        for li in models:
            # ...
            a_tag = li.find("a")
            if not a_tag:
                continue

            # 1.
            title_div = a_tag.find("div", {"x-test-model-title": True})
            name = title_div.find("span").get_text(strip=True) if title_div and title_div.find("span") else "N/A"

            # 2.
            desc_p = a_tag.find("p", {"class": "break-words"})
            description = desc_p.get_text(strip=True) if desc_p else "N/A"

            # 3. capabilities
            capabilities = [
                span.get_text(strip=True) 
                for span in a_tag.find_all("span", {"x-test-capability": True})
            ]

            # 4. sizes
            sizes = [
                span.get_text(strip=True) 
                for span in a_tag.find_all("span", {"x-test-size": True})
            ]

            # 5.
            info_p = a_tag.find("p", {"class": "my-4 flex space-x-5 text-[13px] font-medium text-neutral-500"})
            pulls, tags_count, updated = "N/A", "N/A", "N/A"
            if info_p:
                info_spans = info_p.find_all("span")
                if len(info_spans) >= 3:
                    # span
                    pulls_text = info_spans[0].get_text(strip=True).split()[0]  # "55.6M"
                    pulls = pulls_text if pulls_text else "N/A"

                    # span
                    tags_text = info_spans[1].get_text(strip=True).split()[0]  # "35"
                    tags_count = tags_text if tags_text else "N/A"

                   # x-test-updated span
                    updated_span = a_tag.find("span", {"x-test-updated": True})
                    updated = updated_span.get_text(strip=True) if updated_span else "N/A"


            model_info = {
                "name": name,
                "description": description,
                "capabilities": capabilities,
                "sizes": sizes,
                "pulls": pulls,
                "tags_count": tags_count,
                "updated": updated
            }
            model_info_list.append(model_info)

        update_cache(model_info_list)
        print(f"成功爬取 {len(model_info_list)} 个模型信息")
        print(f"缓存更新时间: {_cache_timestamp}")
        return model_info_list

    except requests.exceptions.RequestException as e:
        print(f"请求失败: {e}")
        return []
    except Exception as e:
        print(f"解析失败: {e}")
        return []

if __name__ == "__main__":
    models = scrape_ollama_models()
    for idx, model in enumerate(models, 1):
        print(f"模型 {idx}:")
        print(f"名称: {model['name']}")
        print(f"描述: {model['description']}")
        print(f"能力: {model['capabilities']}")
        print(f"尺寸: {model['sizes']}")
        print(f"拉取次数: {model['pulls']}")
        print(f"标签数: {model['tags_count']}")
        print(f"更新时间: {model['updated']}")