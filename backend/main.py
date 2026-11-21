
import os
import io

from typing import Literal
import asyncio

from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from google import genai
from google.genai import types


# --------------------------------
# CONFIGURATION
# --------------------------------

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")
MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")

if not API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY is missing. Check your backend .env file."
    )

client = genai.Client(
    api_key=API_KEY,
    http_options=types.HttpOptions(
        timeout=30000
    )
)

app = FastAPI(
    title="Percevia AI Engine",
    description="AI-powered visual accessibility assistant",
    version="1.0.0"
)

# Development CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------
# AI PROMPTS
# --------------------------------

PROMPTS = {
    "scene": """
You are Percevia, a concise live visual assistant.

Describe only the most important object currently visible.

Rules:
- Maximum 12 words.
- One short sentence only.
- Focus on the main foreground object.
- Ignore unnecessary background details.
- Never introduce yourself or greet the user.
- Do not repeat previous descriptions.
- Do not invent distance, movement or danger.
- If the image is unclear, say so briefly.
""",

    "read": """
You are Percevia's Smart Read assistant.

Extract and read all clearly visible text.

Prioritise:
1. Headings and labels.
2. Names and numbers.
3. Dates and expiry information.
4. Instructions and important notices.

Preserve the original meaning.
Do not guess unreadable characters.
Mention when the image is blurry or text is unclear.

For medicine labels, read the visible information
without providing medical advice.
""",

    "ask": """
You are Percevia's visual question-answering assistant.

Answer the user's question using only information
that can reasonably be observed in the photograph.

Give a direct and useful response.

If the requested object cannot be identified,
say so honestly.

Never invent an object's identity, position or distance.
Use simple language suitable for spoken responses.
"""
}

# --------------------------------
# HOME AND HEALTH ENDPOINTS
# --------------------------------

@app.get("/")
async def root():
    return {
        "application": "Percevia AI Engine",
        "status": "online",
        "version": "1.0.0"
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "ai_configured": bool(API_KEY),
        "model": MODEL
    }


# --------------------------------
# IMAGE ANALYSIS ENDPOINT
# --------------------------------

@app.post("/analyze")
async def analyze_image(
    image: UploadFile = File(...),
    mode: Literal["scene", "read", "ask"] = Form("scene"),
    question: str = Form("")
):

    # Validate file type
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="Please upload a valid image."
        )

    # Read image
    image_bytes = await image.read()

    if not image_bytes:
        raise HTTPException(
            status_code=400,
            detail="The uploaded image is empty."
        )

    if len(image_bytes) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="Image must be smaller than 10 MB."
        )

    # Validate image content
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            img.verify()

    except Exception:
        raise HTTPException(
            status_code=400,
            detail="The uploaded image is not valid."
        )

    # Validate question
    if mode == "ask" and not question.strip():
        raise HTTPException(
            status_code=400,
            detail="Please enter a question."
        )

    # Build prompt
    prompt = PROMPTS[mode]

    if mode == "ask":
        prompt += (
            "\n\nUSER QUESTION: "
            + question.strip()
        )

    
    
    try:
        # Prepare the Gemini request
        def call_gemini():
            return client.models.generate_content(
                model=MODEL,
                contents=[
                    prompt,
                    types.Part.from_bytes(
                        data=image_bytes,
                        mime_type=image.content_type
                    )
                ],
                config=types.GenerateContentConfig(
                    temperature=0.2,
                    max_output_tokens=50
                )
            )

        response = None

        # Maximum two attempts: original + one retry
        for attempt in range(2):
            try:
                response = await asyncio.wait_for(
                    asyncio.to_thread(call_gemini),
                    timeout=35
                )
                break

            except asyncio.TimeoutError:
                raise HTTPException(
                    status_code=504,
                    detail="AI analysis timed out. Please try again."
                )

            except Exception as error:
                error_text = str(error)

                temporary_error = (
                    "503" in error_text
                    or "UNAVAILABLE" in error_text
                )

                if temporary_error and attempt == 0:
                    print(
                        "Gemini temporarily overloaded. "
                        "Retrying once after 1 second..."
                    )
                    await asyncio.sleep(1)
                    continue

                raise

        if response is None or not response.text:
            raise HTTPException(
                status_code=502,
                detail="Gemini returned an empty response."
            )

        return {
            "success": True,
            "application": "Percevia",
            "mode": mode,
            "answer": response.text.strip()
        }

    except HTTPException:
        raise

    except Exception as error:
        print("Gemini error:", repr(error))

        if "503" in str(error) or "UNAVAILABLE" in str(error):
            raise HTTPException(
                status_code=503,
                detail="AI service is busy. Please try again shortly."
            )

        raise HTTPException(
            status_code=502,
            detail="AI analysis failed. Please try again."
        )
