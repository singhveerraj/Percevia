
# Percevia – A World: Within Reach

**An AI-powered visual accessibility companion that helps people with visual impairments understand their surroundings through intelligent vision and voice interaction.**

<p align="center">
  <strong>See the world differently. Experience it independently.</strong>
</p>

---

## About the Project

Percevia is a smartphone-based AI visual assistant designed to make everyday environments more accessible for people with visual impairments.

Using a smartphone camera, artificial intelligence and voice interaction, Percevia interprets visual information and communicates it through natural spoken descriptions.

From understanding surroundings to reading text and answering questions about objects, Percevia aims to make visual information more accessible, one interaction at a time.

## The Problem

People with visual impairments often face challenges in accessing everyday visual information, including:

- Understanding unfamiliar surroundings.
- Reading signboards, notices and printed text.
- Identifying objects and interpreting visual scenes.
- Accessing information independently while navigating daily environments.

Traditional assistive solutions may not always provide the contextual, real-time visual understanding users need.

## Our Solution

Percevia combines computer vision, generative AI and speech technologies to create an interactive visual assistant.

Users can point their smartphone camera towards a scene, request an explanation or ask questions. The AI analyses the provided image and communicates its response through speech.

## Key Features

### 1. Scene Understanding
Provides AI-generated descriptions of surroundings to help users understand what is visible through the camera.

### 2. Smart Read
Helps users access text from visual content such as notices, signboards and printed material.

### 3. Ask Percevia
Allows users to ask questions about a captured visual scene and receive contextual AI-generated answers.

### 4. Voice Interaction
Converts spoken questions into text and delivers AI responses through text-to-speech.

### 5. Live Scene Monitoring
Periodically analyses camera frames and provides spoken scene updates when significant changes are detected.

## How It Works

**Capture → Analyse → Interpret → Speak**

1. The smartphone camera captures an image.
2. The image and selected request are sent to the backend.
3. The backend processes the request using Google's Gemini AI.
4. The generated response is returned to the mobile application.
5. Percevia communicates the result through speech.

## Technology Stack

| Component | Technology |
|---|---|
| Mobile Application | React Native |
| Development Framework | Expo |
| Programming Language | TypeScript |
| Backend | Python, FastAPI |
| AI Model | Google Gemini 3.1 Flash-Lite |
| Speech-to-Text | Expo Speech Recognition |
| Text-to-Speech | Expo Speech |
| Image Processing | Pillow |
| API Communication | HTTP / REST |

## Project Structure

```text
Percevia/
│
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── .env.example
│
├── mobile/
│   ├── App.tsx
│   ├── app.json
│   ├── package.json
│   └── assets/
│
├── .gitignore
└── README.md
```

## Getting Started

### Prerequisites

- Node.js and npm
- Python 3.10+
- Expo development environment
- Google Gemini API key

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR-USERNAME/Percevia.git
cd Percevia
```

### 2. Set Up the Backend

```bash
cd backend
pip install -r requirements.txt
```

Create a `.env` file inside the backend folder:

```env
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.1-flash-lite
```

Start the backend:

```bash
python -m uvicorn main:app --host 0.0.0.0 --port 8001
```

### 3. Set Up the Mobile Application

Open another terminal:

```bash
cd mobile
npm install
```

Start Expo:

```bash
npx expo start --dev-client
```

Connect the mobile application to the backend by configuring the backend API address in the application.

**Note:** A compatible Expo development build is required for native speech-recognition functionality.

## Privacy and Safety

Percevia is designed with accessibility and responsible AI usage in mind.

- API credentials should be stored in environment variables.
- Images are processed for analysis and are not intentionally stored by the application backend.
- AI-generated descriptions may contain inaccuracies.
- Percevia is intended as an assistive information tool and is not a replacement for a white cane, guide dog, mobility training or other established mobility aids.

## Future Scope

We aim to expand Percevia with:

- On-device object detection.
- Improved contextual and conversational memory.
- Intelligent visual frame selection.
- More efficient processing and battery optimisation.
- Priority-based environmental alerts.
- Improved hands-free interaction.
- Scalable cloud infrastructure.

## Team

**Team Name: The Amethyst**

**Project: Percevia – A World: Within Reach**

Built with the vision of making technology more inclusive, accessible and empowering.

---

<p align="center">
  <strong>Percevia – A World: Within Reach.</strong>
  <br/>
  <i>Making the unseen more understandable.</i>
</p>
