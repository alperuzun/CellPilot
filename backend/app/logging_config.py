import logging
import sys


def setup_logging(log_file: str = "backend.log", level: str = "INFO") -> None:
    """Call once at app startup (main.py). All modules then just do:
       import logging
       logger = logging.getLogger(__name__)
    """

    log_level = getattr(logging, level.upper(), logging.INFO)

    # Root logger — catches everything
    root = logging.getLogger()
    root.setLevel(log_level)

    # Format: 2026-03-09 01:04:12 | INFO | app.annotate | message
    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    console = logging.StreamHandler(sys.stdout)
    console.setLevel(log_level)
    console.setFormatter(formatter)

    file_handler = logging.FileHandler(log_file)
    file_handler.setLevel(log_level)
    file_handler.setFormatter(formatter)

    root.addHandler(console)
    root.addHandler(file_handler)

    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
