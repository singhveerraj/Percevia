
import os
import json
import urllib.request
import urllib.error

from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")

if not API_KEY:
    raise SystemExit("Gemini API key missing from .env")

models = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash-lite"
]

for model in models:
    print(f"\nTesting {model}...")

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/"
        f"models/{model}:generateContent?key={API_KEY}"
    )

    payload = {
        "contents": [{
            "parts": [{
                "text": "Reply with exactly: PERCEVIA ONLINE"
            }]
        }]
    }

    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            result = json.loads(response.read())
            answer = result["candidates"][0]["content"]["parts"][0]["text"]

            print("SUCCESS:", answer)
            print("WORKING MODEL:", model)
            break

    except urllib.error.HTTPError as error:
        print("HTTP ERROR:", error.code)
        print(error.read().decode()[:500])

    except Exception as error:
        print("CONNECTION ERROR:", str(error))

else:
    print("\nNo tested model responded successfully.")
