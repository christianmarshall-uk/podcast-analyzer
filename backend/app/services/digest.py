import anthropic
import json
import re
import base64
import httpx
import random
from datetime import datetime, timedelta
from typing import Optional
from dataclasses import dataclass
import logging

from ..config import get_settings

logger = logging.getLogger(__name__)

ARTISTS = [
    ("Wassily Kandinsky", "Bold geometric shapes, vibrant primary colours, hard-edged circles and diagonal lines, musical rhythm translated to pure abstract form, no representational imagery"),
    ("Vincent van Gogh", "Thick swirling impasto brushstrokes, electric yellows and cobalt blues, the scene pulsing with emotional intensity, turbulent sky, heavy visible texture in every mark"),
    ("Salvador Dali", "Hyper-realistic surrealist dreamscape, melting impossible objects, vast arid desert extending to infinity, photographic detail applied to absurd scenarios, deep chiaroscuro shadow"),
    ("Katsushika Hokusai", "Japanese ukiyo-e woodblock print, bold flat black outlines, stylised ocean waves, graphic pattern fills, indigo and cream colour blocks, negative space as deliberate design element"),
    ("Gustav Klimt", "Art Nouveau gold leaf, ornamental spiral patterns covering every surface, jewel-like mosaic tiles, Byzantine richness, figures dissolving into decorative abstraction, copper and burnished gold dominant"),
    ("Jackson Pollock", "Abstract expressionist action painting, dense layered drips and splashes of industrial enamel, chaotic web of poured lines, raw canvas visible beneath, violent kinetic energy frozen in paint"),
    ("Egon Schiele", "Viennese expressionism, raw angular contour lines, elongated distorted forms, sickly ochre and burnt sienna palette, scratchy gestural marks, claustrophobic psychological rawness"),
    ("J.M.W. Turner", "Romantic sublime, atmosphere dissolving all solid forms into luminous vapour, golden apocalyptic light consuming the horizon, loose watercolour washes, barely legible forms emerging from radiant mist"),
    ("Roy Lichtenstein", "Bold black comic-strip outlines, Ben-Day dot pattern fills, flat primary colours, dramatic close-up cropping, graphic mechanical reproduction aesthetic, ironic pop art sensibility"),
    ("Edvard Munch", "Nordic expressionism, anxiety encoded in writhing undulating landscape lines, sickly green and blood-red sky, hollow-eyed figures, the horizon itself trembling with existential dread"),
    ("Georges Seurat", "Pointillist technique, entire image built from thousands of tiny pure-colour dots, shimmering optical colour mixing, scientific colour theory applied methodically, rigid formal composition"),
    ("Hieronymus Bosch", "Flemish Renaissance grotesque, teeming with impossible hybrid creatures, fantastical architectural structures, dense narrative detail in every corner, jewel-toned accents on earthy ground, medieval symbolism"),
    ("Frida Kahlo", "Mexican folk art fused with surrealism, flat decorative style, dense tropical foliage, bold botanical colour, symbolic objects charged with intense personal meaning, naive directness"),
    ("Mark Rothko", "Colour field abstraction, two or three luminous soft-edged rectangles of pure colour floating on canvas, emotional resonance through scale and hue relationship alone, meditative silence"),
    ("Edward Hopper", "American realism, stark raking light cutting across architecture, profound urban loneliness, diner windows glowing at night, long afternoon shadows, psychological stillness"),
    ("Utagawa Hiroshige", "Japanese woodblock landscape, flat colour planes divided by bold outlines, snow falling in diagonal lines, travellers tiny against monumental nature, deep indigo and terracotta palette"),
    ("Paul Gauguin", "Post-impressionist palette, flat bold outlines, non-naturalistic saturated colour fills, figures simplified to monumental shapes, decorative pattern, tropical flora as charged backdrop"),
    ("Umberto Boccioni", "Italian Futurism, dynamic force lines radiating outward, multiple simultaneous states of motion layered, fractured planes of colour, industrial energy and speed made visible"),
    ("Alphonse Mucha", "Czech Art Nouveau, flowing curvilinear botanical borders, pearl and rose palette, mosaic-like halos, ornate floral frame surrounding the central image, decorative flat linework"),
    ("Kazimir Malevich", "Russian Suprematism, pure geometric forms floating on white ground, black and red squares and rectangles, absolute reduction to essential form, zero reference to the natural world"),
]


@dataclass
class DigestResult:
    """Cross-episode analysis result."""
    summary: str
    common_themes: list[str]
    trends: list[dict]  # {"trend": str, "evidence": str, "direction": str}
    predictions: list[str]
    recommendations: list[str]
    key_advice: list[str]
    action_items: list[str]
    image_url: Optional[str] = None
    image_prompt: Optional[str] = None


class DigestService:
    def __init__(self):
        settings = get_settings()
        self.anthropic_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        self.google_api_key = settings.google_api_key

    def _format_episode_data(self, episodes_with_analysis: list[dict]) -> str:
        """Format episode analyses for the prompt."""
        formatted = []
        for ep in episodes_with_analysis:
            analysis = ep.get("analysis", {})
            formatted.append(f"""
EPISODE: {ep.get('title', 'Unknown')}
PODCAST: {ep.get('podcast_title', 'Unknown')}
DATE: {ep.get('published_at', 'Unknown')}

Overview: {analysis.get('overview', 'N/A')}

Key Points:
{chr(10).join('- ' + p for p in analysis.get('key_points', []))}

Themes: {', '.join(analysis.get('themes', []))}

Predictions:
{chr(10).join('- ' + p for p in analysis.get('predictions', []))}

Recommendations:
{chr(10).join('- ' + r for r in analysis.get('recommendations', []))}

Advice:
{chr(10).join('- ' + a for a in analysis.get('advice', []))}
""")
        return "\n---\n".join(formatted)

    def _parse_json_response(self, response: str) -> dict:
        """Parse JSON from Claude's response."""
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            pass

        json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass

        json_match = re.search(r'\{.*\}', response, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(0))
            except json.JSONDecodeError:
                pass

        return {}

    async def _generate_image_gemini(self, prompt: str) -> Optional[str]:
        """Generate image using Google Gemini (Nano Banana) API."""
        if not self.google_api_key:
            logger.warning("No Google API key configured")
            return None

        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                # Use Imagen 4 for image generation
                response = await client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict",
                    headers={
                        "Content-Type": "application/json",
                        "x-goog-api-key": self.google_api_key
                    },
                    json={
                        "instances": [{"prompt": prompt}],
                        "parameters": {
                            "sampleCount": 1,
                            "aspectRatio": "16:9"
                        }
                    }
                )

                if response.status_code == 200:
                    data = response.json()
                    # Extract image from Imagen predict response
                    predictions = data.get("predictions", [])
                    if predictions:
                        image_data = predictions[0].get("bytesBase64Encoded", "")
                        if image_data:
                            return f"data:image/png;base64,{image_data}"
                    # Fallback: try other response formats
                    images = data.get("generatedImages", [])
                    if images:
                        image_data = images[0].get("image", {}).get("imageBytes", "")
                        if image_data:
                            return f"data:image/png;base64,{image_data}"
                    logger.warning(f"No image in response: {list(data.keys())}")
                    return None
                else:
                    logger.error(f"Gemini API error: {response.status_code} - {response.text}")
                    return None

        except Exception as e:
            logger.error(f"Gemini image generation failed: {e}")
            return None

    async def generate_image_for_prompt(self, prompt: str) -> Optional[str]:
        """Call Gemini Imagen-4 with an already-constructed prompt and return base64 data URI, or None on failure."""
        return await self._generate_image_gemini(prompt)

    async def generate_digest(
        self,
        episodes_with_analysis: list[dict],
        period_start: datetime,
        period_end: datetime,
        generate_image: bool = True,
        progress_callback=None
    ) -> DigestResult:
        """Generate a cross-episode digest analysis."""

        if not episodes_with_analysis:
            return DigestResult(
                summary="No episodes to analyze.",
                common_themes=[],
                trends=[],
                predictions=[],
                recommendations=[],
                key_advice=[],
                action_items=[]
            )

        episode_data = self._format_episode_data(episodes_with_analysis)

        prompt = f"""You are an expert analyst synthesizing insights from multiple podcast episodes.

Analyze the following podcast episode summaries from {period_start.strftime('%B %d, %Y')} to {period_end.strftime('%B %d, %Y')}.

Your task is to identify patterns, trends, and synthesize actionable intelligence across all episodes.

Return a JSON object with:
{{
    "summary": "A comprehensive 2-3 paragraph executive summary of the key insights from this period",
    "common_themes": ["Theme that appears across multiple episodes", ...],
    "trends": [
        {{
            "trend": "Description of the trend",
            "evidence": "Evidence from the episodes",
            "direction": "emerging|growing|declining|stable"
        }},
        ...
    ],
    "predictions": ["Synthesized predictions about what will happen based on the content", ...],
    "recommendations": ["What listeners should DO based on all this information", ...],
    "key_advice": ["The most important pieces of advice from across episodes", ...],
    "action_items": ["Specific actionable steps to take", ...],
    "image_description": "A single evocative visual scene (10-20 words) that metaphorically represents the podcast themes - describe a specific landscape, architecture, or natural scene, not abstract concepts"
}}

Guidelines:
- Identify themes that appear in 2+ episodes
- Look for contradictions or debates between different sources
- Synthesize predictions - what do multiple sources agree on?
- Prioritize actionable recommendations
- The action_items should be specific and practical
- Group similar advice together
- Note any consensus or disagreement among sources

EPISODE ANALYSES:
{episode_data}

Respond ONLY with the JSON object."""

        message = await self.anthropic_client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}]
        )

        result = self._parse_json_response(message.content[0].text)

        # Generate image if requested
        image_url = None
        image_prompt = None
        if generate_image and result.get("image_description"):
            if progress_callback:
                progress_callback("Selecting artist and composing image prompt...")
            artist_name, artist_style = random.choice(ARTISTS)
            image_prompt = f"Painting in the style of {artist_name}. {artist_style}. Scene: {result.get('image_description')}. No text, no words, no letters."
            logger.info(f"Generating image with prompt: {image_prompt}")
            if progress_callback:
                progress_callback(f"Painting in the style of {artist_name} — this takes ~30s...")
            image_url = await self._generate_image_gemini(image_prompt)
            if image_url:
                logger.info("Image generated successfully")
            else:
                logger.warning("Image generation returned no result")

        return DigestResult(
            summary=result.get("summary", ""),
            common_themes=result.get("common_themes", []),
            trends=result.get("trends", []),
            predictions=result.get("predictions", []),
            recommendations=result.get("recommendations", []),
            key_advice=result.get("key_advice", []),
            action_items=result.get("action_items", []),
            image_url=image_url,
            image_prompt=image_prompt
        )
