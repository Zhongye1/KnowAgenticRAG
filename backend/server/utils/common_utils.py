import logging


def setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        force=True,
    )

    uvicorn_logger = logging.getLogger("uvicorn")
    logging.getLogger("uvicorn.access").handlers.clear()

    formatter = logging.Formatter(fmt="%(asctime)s %(levelname)s: %(message)s", datefmt="%m-%d %H:%M:%S")
    for handler in uvicorn_logger.handlers:
        handler.setFormatter(formatter)
