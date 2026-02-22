import whisper
import torch
from pathlib import Path
from typing import Optional
import logging

logger = logging.getLogger(__name__)


def _detect_device() -> str:
    """Detect best available compute device."""
    if torch.cuda.is_available():
        return "cuda"
    try:
        if torch.backends.mps.is_available():
            return "mps"
    except AttributeError:
        pass
    return "cpu"


class TranscriptionService:
    def __init__(self, model_name: str = "base"):
        """
        Initialize with local Whisper model.

        Args:
            model_name: Whisper model size - 'tiny', 'base', 'small', 'medium', 'large'
                       Larger models are more accurate but slower.
        """
        device = _detect_device()
        logger.info(f"Loading Whisper model: {model_name} on {device}")
        try:
            self.model = whisper.load_model(model_name, device=device)
            self.device = device
        except Exception as e:
            if device != "cpu":
                logger.warning(f"Failed to load Whisper on {device} ({e}), falling back to CPU")
                self.model = whisper.load_model(model_name, device="cpu")
                self.device = "cpu"
            else:
                raise
        logger.info(f"Whisper model loaded on {self.device}")

    async def transcribe(self, audio_path: str, language: Optional[str] = None) -> str:
        """
        Transcribe an audio file using local Whisper model.

        Args:
            audio_path: Path to the audio file
            language: Optional language code (e.g., 'en', 'es')

        Returns:
            Transcribed text
        """
        path = Path(audio_path)
        if not path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        options = {}
        if language:
            options["language"] = language

        result = self.model.transcribe(str(audio_path), **options)
        return result["text"]

    async def transcribe_with_timestamps(self, audio_path: str, language: Optional[str] = None) -> dict:
        """
        Transcribe an audio file with segment timestamps.

        Returns:
            Dictionary with 'text' and 'segments' keys
        """
        path = Path(audio_path)
        if not path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        options = {}
        if language:
            options["language"] = language

        result = self.model.transcribe(str(audio_path), **options)

        return {
            "text": result["text"],
            "segments": [
                {
                    "start": seg["start"],
                    "end": seg["end"],
                    "text": seg["text"]
                }
                for seg in result.get("segments", [])
            ]
        }
