import httpx
import tempfile
import os
from pathlib import Path
from typing import Optional
import asyncio


class AudioService:
    SUPPORTED_FORMATS = [".mp3", ".m4a", ".wav", ".ogg", ".webm"]
    MAX_FILE_SIZE = 500 * 1024 * 1024  # 500MB (local Whisper has no limit)

    def __init__(self, temp_dir: Optional[str] = None):
        self.temp_dir = temp_dir or tempfile.gettempdir()

    async def download_audio(self, url: str, max_size: int = MAX_FILE_SIZE) -> str:
        """
        Download audio file from URL to a temporary file.
        Returns the path to the downloaded file.
        """
        # Determine file extension from URL
        url_path = url.split("?")[0]  # Remove query params
        ext = Path(url_path).suffix.lower()
        if ext not in self.SUPPORTED_FORMATS:
            ext = ".mp3"  # Default to mp3

        # Create temporary file
        fd, temp_path = tempfile.mkstemp(suffix=ext, dir=self.temp_dir)

        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=300.0) as client:
                async with client.stream("GET", url) as response:
                    response.raise_for_status()

                    total_size = 0
                    with os.fdopen(fd, "wb") as f:
                        async for chunk in response.aiter_bytes(chunk_size=8192):
                            total_size += len(chunk)
                            if total_size > max_size:
                                raise ValueError(f"File too large (>{max_size / 1024 / 1024:.1f}MB)")
                            f.write(chunk)

            return temp_path
        except Exception as e:
            # Clean up on error
            if os.path.exists(temp_path):
                os.unlink(temp_path)
            raise

    def cleanup(self, file_path: str) -> None:
        """Remove a temporary file."""
        try:
            if file_path and os.path.exists(file_path):
                os.unlink(file_path)
        except OSError:
            pass  # Ignore cleanup errors

    def get_file_size(self, file_path: str) -> int:
        """Get file size in bytes."""
        return os.path.getsize(file_path)

    def needs_chunking(self, file_path: str) -> bool:
        """Check if file exceeds Whisper API size limit."""
        return self.get_file_size(file_path) > self.MAX_FILE_SIZE
