from dotenv import load_dotenv

load_dotenv(".env", override=True)

from concurrent.futures import ThreadPoolExecutor  # noqa: E402

try:
    from importlib.metadata import version

    __version__ = version("ars")
except Exception:
    __version__ = "unknown"

executor = ThreadPoolExecutor()  # noqa: E402


def get_version():
    """Return the ARS version."""
    return __version__
