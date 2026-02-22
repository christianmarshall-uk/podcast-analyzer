import anthropic
import json
import re
from typing import Optional
from dataclasses import dataclass
from ..config import get_settings


@dataclass
class StructuredAnalysis:
    """Structured analysis result from a podcast episode."""
    overview: str
    key_points: list[str]
    topics: list[str]
    themes: list[str]
    predictions: list[str]
    recommendations: list[str]
    advice: list[str]
    notable_quotes: list[str]
    raw_summary: str  # Full text summary for backward compatibility


class SummarizerService:
    MAX_TOKENS = 100000
    CHUNK_SIZE = 80000

    def __init__(self):
        settings = get_settings()
        self.client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    def _create_structured_prompt(self, transcript: str) -> str:
        return f"""You are an expert podcast analyst. Analyze the following podcast transcript and provide a comprehensive structured analysis.

Return your analysis as a JSON object with the following structure (ensure valid JSON):
{{
    "overview": "A brief 2-3 sentence summary of the episode",
    "key_points": ["Main point 1", "Main point 2", ...],
    "topics": ["Topic 1", "Topic 2", ...],
    "themes": ["Key theme 1", "Key theme 2", ...],
    "predictions": ["Any predictions about the future mentioned", ...],
    "recommendations": ["Actionable recommendations for listeners", ...],
    "advice": ["Key pieces of advice given", ...],
    "notable_quotes": ["Important quote 1", "Important quote 2", ...],
    "summary": "A detailed 2-3 paragraph summary"
}}

Guidelines:
- Extract 5-10 key points that capture the main content
- Identify 3-7 major topics discussed
- Identify 2-5 overarching themes
- Note any predictions about future trends, events, or developments
- Extract actionable recommendations - what should listeners DO with this information?
- Capture key pieces of advice given by speakers
- Include 2-4 notable or memorable quotes
- If a category has no content (e.g., no predictions were made), use an empty array

TRANSCRIPT:
{transcript}

Respond ONLY with the JSON object, no additional text."""

    def _parse_json_response(self, response: str) -> dict:
        """Parse JSON from Claude's response, handling potential formatting issues."""
        # Try direct JSON parse first
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            pass

        # Try to extract JSON from markdown code block
        json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass

        # Try to find JSON object in response
        json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', response, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(0))
            except json.JSONDecodeError:
                pass

        # Return default structure if parsing fails
        return {
            "overview": response[:500] if response else "Analysis failed",
            "key_points": [],
            "topics": [],
            "themes": [],
            "predictions": [],
            "recommendations": [],
            "advice": [],
            "notable_quotes": [],
            "summary": response
        }

    def _chunk_transcript(self, transcript: str) -> list[str]:
        """Split transcript into chunks if too long."""
        if len(transcript) <= self.CHUNK_SIZE:
            return [transcript]

        chunks = []
        words = transcript.split()
        current_chunk = []
        current_length = 0

        for word in words:
            word_len = len(word) + 1
            if current_length + word_len > self.CHUNK_SIZE:
                chunks.append(" ".join(current_chunk))
                current_chunk = [word]
                current_length = word_len
            else:
                current_chunk.append(word)
                current_length += word_len

        if current_chunk:
            chunks.append(" ".join(current_chunk))

        return chunks

    async def analyze(self, transcript: str) -> StructuredAnalysis:
        """Generate structured analysis of the podcast transcript."""
        chunks = self._chunk_transcript(transcript)

        if len(chunks) == 1:
            return await self._analyze_single(transcript)
        else:
            return await self._analyze_chunked(chunks)

    async def _analyze_single(self, transcript: str) -> StructuredAnalysis:
        """Analyze a single transcript."""
        message = await self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
            messages=[
                {"role": "user", "content": self._create_structured_prompt(transcript)}
            ]
        )

        result = self._parse_json_response(message.content[0].text)

        return StructuredAnalysis(
            overview=result.get("overview", ""),
            key_points=result.get("key_points", []),
            topics=result.get("topics", []),
            themes=result.get("themes", []),
            predictions=result.get("predictions", []),
            recommendations=result.get("recommendations", []),
            advice=result.get("advice", []),
            notable_quotes=result.get("notable_quotes", []),
            raw_summary=result.get("summary", "")
        )

    async def _analyze_chunked(self, chunks: list[str]) -> StructuredAnalysis:
        """Analyze transcript in chunks and combine."""
        # First pass: analyze each chunk
        chunk_results = []
        for i, chunk in enumerate(chunks):
            prompt = f"""This is part {i+1} of {len(chunks)} of a podcast transcript.
Analyze this section and return a JSON object with:
{{
    "key_points": ["point 1", ...],
    "topics": ["topic 1", ...],
    "themes": ["theme 1", ...],
    "predictions": ["prediction 1", ...],
    "recommendations": ["recommendation 1", ...],
    "advice": ["advice 1", ...],
    "notable_quotes": ["quote 1", ...],
    "section_summary": "Brief summary of this section"
}}

TRANSCRIPT SECTION:
{chunk}

Respond ONLY with the JSON object."""

            message = await self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=2048,
                messages=[{"role": "user", "content": prompt}]
            )
            chunk_results.append(self._parse_json_response(message.content[0].text))

        # Second pass: combine and synthesize
        combined_data = json.dumps(chunk_results, indent=2)

        final_prompt = f"""The following are structured analyses of different sections of a podcast episode.
Combine them into a single coherent analysis.

Return a JSON object with:
{{
    "overview": "A brief 2-3 sentence summary of the entire episode",
    "key_points": ["Deduplicated and prioritized main points (5-10)"],
    "topics": ["Major topics across all sections"],
    "themes": ["Overarching themes (2-5)"],
    "predictions": ["All predictions about the future"],
    "recommendations": ["Actionable recommendations for listeners"],
    "advice": ["Key pieces of advice"],
    "notable_quotes": ["Most memorable quotes (2-4)"],
    "summary": "A detailed 2-3 paragraph summary of the entire episode"
}}

SECTION ANALYSES:
{combined_data}

Respond ONLY with the JSON object."""

        message = await self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
            messages=[{"role": "user", "content": final_prompt}]
        )

        result = self._parse_json_response(message.content[0].text)

        return StructuredAnalysis(
            overview=result.get("overview", ""),
            key_points=result.get("key_points", []),
            topics=result.get("topics", []),
            themes=result.get("themes", []),
            predictions=result.get("predictions", []),
            recommendations=result.get("recommendations", []),
            advice=result.get("advice", []),
            notable_quotes=result.get("notable_quotes", []),
            raw_summary=result.get("summary", "")
        )

    # Keep backward compatibility
    async def summarize(self, transcript: str) -> str:
        """Generate a plain text summary (backward compatible)."""
        analysis = await self.analyze(transcript)
        return analysis.raw_summary
