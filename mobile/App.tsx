
import React, { useEffect, useRef, useState } from "react";

import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  TextInput,
  Image,
  ActivityIndicator,
  BackHandler,
} from "react-native";

import {
  CameraView,
  useCameraPermissions,
} from "expo-camera";

import * as Speech from "expo-speech";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import * as FileSystem from "expo-file-system/legacy";

import { SafeAreaView } from "react-native-safe-area-context";

// IMPORTANT: Replace this with your laptop's Wi-Fi IPv4 address.
// Example: http://192.168.1.8:8000
const API_URL = "http://192.168.137.1:8001";

type Mode = "scene" | "read" | "ask";

// Remove Markdown formatting before displaying or speaking AI responses.
// This prevents symbols such as **, *, and # from being read aloud.
function cleanAIResponse(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/```[\w-]*\n?/g, "").replace(/```/g, ""))
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/^(?:hello[,!:. ]*)?(?:i am percevia|i'm percevia|percevia here)[,!:. ]*/i, "")
    .replace(/^hello[,!:. ]*/i, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export default function App() {
  const cameraRef = useRef<CameraView>(null);

  const [permission, requestPermission] =
    useCameraPermissions();

  const [screen, setScreen] = useState<"home" | "camera">("home");
  const [mode, setMode] = useState<Mode>("scene");

  const [photo, setPhoto] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState("");
  const [monitoring, setMonitoring] = useState(false);
  const [liveStatus, setLiveStatus] = useState("Ready to start");

  const monitoringRef = useRef(false);
  const frameBusyRef = useRef(false);
  const latestFrameRef = useRef<string | null>(null);
  const askBusyRef = useRef(false);
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSpokenRef = useRef("");
  const lastSpokenAtRef = useRef(0);
  const lastObservationRef = useRef("");

  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results?.[0]?.transcript;
    if (transcript) {
      setQuestion(transcript);
      if (event.isFinal && mode === "ask") {
        askAboutLiveView(transcript);
      }
    }
  });

  useSpeechRecognitionEvent("end", () => {
    setIsListening(false);
  });

  useSpeechRecognitionEvent("error", (event) => {
    setIsListening(false);
    console.log("Percevia speech recognition error:", event);
    const message = event.message || "Speech recognition could not hear you. Please try again.";
    setResponse(message);
  });

  const modeTitle = {
    scene: "Describe surroundings",
    read: "Read text",
    ask: "Ask Percevia",
  };

  useEffect(() => {
    return () => {
      monitoringRef.current = false;
      if (liveTimerRef.current) {
        clearTimeout(liveTimerRef.current);
      }
      Speech.stop();
      try { ExpoSpeechRecognitionModule.stop(); } catch {}
    };
  }, []);


  useEffect(() => {
    if (screen !== "camera" || mode !== "ask") return;

    const startTimer = setTimeout(() => {
      if (!monitoringRef.current) startMonitoring();
    }, 1200);

    return () => clearTimeout(startTimer);
  }, [screen, mode]);

  async function analyzeLiveFrame() {
    if (
      !cameraRef.current ||
      !monitoringRef.current ||
      frameBusyRef.current
    ) {
      return;
    }

    frameBusyRef.current = true;
    setLiveStatus("Looking around…");

    try {
      // A temporary low-resolution frame is sampled from the live preview.
      // It is uploaded for analysis and is not saved to the user's gallery.
      const frame = await cameraRef.current.takePictureAsync({
        quality: 0.35,
        skipProcessing: true,
        shutterSound: false,
      });

      if (!frame?.uri || !monitoringRef.current) return;


      if (mode === "ask") {
        latestFrameRef.current = frame.uri;
        setLiveStatus("Live view ready — ask me anything");
        return;
      }

      const uploadResult = await FileSystem.uploadAsync(
        `${API_URL}/analyze`,
        frame.uri,
        {
          httpMethod: "POST",
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          fieldName: "image",
          mimeType: "image/jpeg",
          parameters: {
            mode: "scene",
            question: `You are Percevia, a concise live visual companion. Describe ONLY the most important object or activity visible RIGHT NOW, preferably in the centre or foreground. Do not describe the whole room, distant background, furniture, windows, people or objects unless they are the main subject or important for immediate awareness. Use one short, natural sentence (about 8–20 words). Do not greet, introduce yourself, say 'I am Percevia', or repeat a previous introduction. Do not use Markdown, headings, bullets or labels. Do not invent details.

Previous observation: ${lastObservationRef.current || "None yet."}

Compare it with the CURRENT frame. If the main subject has changed, describe the new subject only. If the view is essentially unchanged, reply with exactly: NO_SIGNIFICANT_CHANGE. Never describe an object from the previous observation unless it is clearly visible and still the main subject in the current frame.`,
          },
        }
      );

      if (!monitoringRef.current) return;

      let data: any;
      try {
        data = JSON.parse(uploadResult.body);
      } catch {
        throw new Error("The analysis service returned an unreadable response.");
      }
      console.log("BACKEND RESPONSE:", uploadResult.body);

      if (
        uploadResult.status < 200 ||
        uploadResult.status >= 300 ||
        !data.success ||
        !data.answer
      ) {
        throw new Error(
          data.detail || data.answer || `Analysis failed (HTTP ${uploadResult.status}).`
        );
      }

      const rawAnswer = String(data.answer).trim();
      if (rawAnswer.includes("NO_SIGNIFICANT_CHANGE")) {
        setLiveStatus("No significant change detected");
        return;
      }

      const answer = cleanAIResponse(rawAnswer);
      if (answer) {
        lastObservationRef.current = answer;
        setResponse(answer);
        setLiveStatus("Monitoring surroundings");

        // Speak only when the current view produces a genuinely new concise description.
        const comparisonText = answer.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
        const now = Date.now();
        if (
          comparisonText &&
          comparisonText !== lastSpokenRef.current &&
          now - lastSpokenAtRef.current >= 2500
        ) {
          lastSpokenRef.current = comparisonText;
          lastSpokenAtRef.current = now;
          Speech.stop();
          Speech.speak(answer.slice(0, 180), {
            language: "en-IN",
            rate: 1.0,
          });
        }
      }
    } catch (error: any) {
      console.log("Percevia live monitoring error:", error);
      if (monitoringRef.current) {
        setLiveStatus("Connection issue — retrying");
      }
    } finally {
      frameBusyRef.current = false;
      // Wait briefly after each completed request; never overlap frame uploads.
      if (monitoringRef.current) {
        liveTimerRef.current = setTimeout(() => {
          analyzeLiveFrame();
        }, mode === "ask" ? 1800 : 5000);
      }
    }
  }

  function startMonitoring() {
    if (monitoringRef.current) return;

    monitoringRef.current = true;
    setMonitoring(true);
    setResponse("");
    setLiveStatus("Starting live monitoring…");
    lastSpokenRef.current = "";
    lastSpokenAtRef.current = 0;
    lastObservationRef.current = "";
    Speech.stop();
    Speech.speak("Live monitoring started.", {
      language: "en-IN",
    });
    analyzeLiveFrame();
  }

  function stopMonitoring() {
    monitoringRef.current = false;
    setMonitoring(false);
    setLiveStatus("Monitoring paused");
    if (liveTimerRef.current) {
      clearTimeout(liveTimerRef.current);
      liveTimerRef.current = null;
    }
    Speech.stop();
    Speech.speak("Live monitoring paused.", {
      language: "en-IN",
    });
  }

  function openCamera(selectedMode: Mode) {
    try { ExpoSpeechRecognitionModule.stop(); } catch {}
    setIsListening(false);
    monitoringRef.current = false;
    if (liveTimerRef.current) {
      clearTimeout(liveTimerRef.current);
      liveTimerRef.current = null;
    }
    setMonitoring(false);
    setLiveStatus("Ready to start");
    frameBusyRef.current = false;
    lastSpokenRef.current = "";
    lastObservationRef.current = "";
    latestFrameRef.current = null;
    Speech.stop();
    setMode(selectedMode);
    setPhoto(null);
    setResponse("");
    setQuestion("");
    setScreen("camera");
  }

  function goHome() {
    try { ExpoSpeechRecognitionModule.stop(); } catch {}
    setIsListening(false);
    monitoringRef.current = false;
    if (liveTimerRef.current) {
      clearTimeout(liveTimerRef.current);
      liveTimerRef.current = null;
    }
    setMonitoring(false);
    setLiveStatus("Ready to start");
    Speech.stop();
    setScreen("home");
    latestFrameRef.current = null;
    setPhoto(null);
    setResponse("");
    setLoading(false);
  }

  async function capturePhoto() {
    if (!cameraRef.current || loading) return;

    try {
      setLoading(true);
      Speech.stop();

      const result =
        await cameraRef.current.takePictureAsync({
          quality: 0.75,
          skipProcessing: false,
          shutterSound: false,
        });

      if (result?.uri) {
        setPhoto(result.uri);
        Speech.speak("Image captured.", {
          language: "en-IN",
        });
      }
    } catch (error) {
      console.log("Camera error:", error);
      Speech.speak(
        "Unable to capture the image. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  function retakePhoto() {
    setPhoto(null);
    setResponse("");
  }


  async function startListening() {
    if (isListening || loading) return;

    try {
      Speech.stop();
      const permissionResult =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();

      if (!permissionResult.granted) {
        setResponse("Microphone permission is needed to ask Percevia by voice. You can still type your question.");
        return;
      }

      setResponse("");
      setIsListening(true);
      ExpoSpeechRecognitionModule.start({
        lang: "en-IN",
        interimResults: true,
        continuous: false,
      });
    } catch (error: any) {
      setIsListening(false);
      console.log("Speech recognition start error:", error);
      setResponse(error?.message || "Voice input is unavailable. Please type your question.");
    }
  }

  function stopListening() {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch (error) {
      console.log("Speech recognition stop error:", error);
    }
    setIsListening(false);
  }


  async function askAboutLiveView(spokenQuestion?: string) {
    const questionToAsk = (spokenQuestion ?? question).trim();

    if (!questionToAsk || loading || askBusyRef.current) return;

    const frameUri = latestFrameRef.current;
    if (!frameUri) {
      setResponse("The camera is getting ready. Please wait a moment and ask again.");
      Speech.speak("The camera is getting ready. Please ask again in a moment.", {
        language: "en-IN",
      });
      return;
    }

    askBusyRef.current = true;
    setLoading(true);
    setResponse("");
    Speech.stop();
    setLiveStatus("Thinking about what I can see…");

    try {
      const uploadResult = await FileSystem.uploadAsync(
        `${API_URL}/analyze`,
        frameUri,
        {
          httpMethod: "POST",
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          fieldName: "image",
          mimeType: "image/jpeg",
          parameters: {
            mode: "ask",
            question: questionToAsk,
          },
        }
      );

      const data = JSON.parse(uploadResult.body);

      if (
        uploadResult.status < 200 ||
        uploadResult.status >= 300 ||
        !data.success ||
        !data.answer
      ) {
        throw new Error(
          data.detail || data.answer || `Analysis failed (HTTP ${uploadResult.status}).`
        );
      }

      const answer = cleanAIResponse(String(data.answer));
      setResponse(answer);
      setLiveStatus("Live view ready — ask a follow-up");
      Speech.stop();
      Speech.speak(answer, {
        language: "en-IN",
        rate: 0.9,
      });
    } catch (error: any) {
      console.log("Percevia live Ask error:", error);
      const message =
        typeof error?.message === "string" && error.message
          ? error.message
          : "I could not analyse the live view. Please try again.";
      setResponse(cleanAIResponse(message));
      setLiveStatus("Live view ready — try asking again");
      Speech.stop();
      Speech.speak("Sorry, I could not answer that. Please try again.", {
        language: "en-IN",
      });
    } finally {
      askBusyRef.current = false;
      setLoading(false);
    }
  }

  async function processImage() {
    if (!photo || loading) return;

    if (mode === "ask" && !question.trim()) {
      Speech.speak("Please enter your question first.", {
        language: "en-IN",
      });
      return;
    }

    try {
      setLoading(true);
      setResponse("");
      Speech.stop();
      Speech.speak("Analysing your image. Please wait.", {
        language: "en-IN",
        rate: 1,
      });

      const uploadResult = await FileSystem.uploadAsync(
        `${API_URL}/analyze`,
        photo,
        {
          httpMethod: "POST",
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          fieldName: "image",
          mimeType: "image/jpeg",
          parameters: {
            mode,
            question: question.trim(),
          },
        }
      );

      const data = JSON.parse(uploadResult.body);

      if (uploadResult.status < 200 || uploadResult.status >= 300 || !data.success || !data.answer) {
        throw new Error(
          data.detail || data.answer || `Analysis failed (HTTP ${uploadResult.status}).`
        );
      }

      const readableAnswer = cleanAIResponse(data.answer);
      setResponse(readableAnswer);
      Speech.stop();
      Speech.speak(readableAnswer, {
        language: "en-IN",
        rate: 0.9,
      });
    } catch (error: any) {
      console.log("Percevia API Error:", error);
      const message =
        typeof error?.message === "string" && error.message.length > 0
          ? error.message
          : "Unable to connect to Percevia. Check your network and try again.";

      const readableMessage = cleanAIResponse(message);
      setResponse(readableMessage);
      Speech.stop();
      Speech.speak(
        "Sorry, I could not analyse the image. Please check the connection and try again.",
        { language: "en-IN" }
      );
    } finally {
      setLoading(false);
    }
  }

  function speakResponse() {
    if (response) {
      Speech.stop();
      Speech.speak(cleanAIResponse(response), {
        language: "en-IN",
        rate: 0.9,
      });
    }
  }

  // HOME SCREEN
  if (screen === "home") {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />

        <ScrollView
          contentContainerStyle={styles.homeContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.brand}>PERCEVIA</Text>
              <Text style={styles.tagline}>
                A World: Within Reach.
              </Text>
            </View>

            <View style={styles.logo}>
              <Text style={styles.logoText}>P</Text>
            </View>
          </View>

          <View style={styles.hero}>
            <View style={styles.accentLine} />

            <Text style={styles.heading}>
              See the world.
            </Text>

            <Text style={styles.headingAccent}>
              Your way.
            </Text>

            <Text style={styles.description}>
              Your intelligent visual companion,
              ready to help you understand the
              world around you.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.mainButton}
            onPress={() => openCamera("scene")}
            accessibilityRole="button"
            accessibilityLabel="Start Seeing. Open camera."
          >
            <Text style={styles.cameraIcon}>◎</Text>

            <Text style={styles.mainButtonTitle}>
              Start Seeing
            </Text>

            <Text style={styles.mainButtonSubtitle}>
              Explore your surroundings
            </Text>
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>
            YOUR COMPANION
          </Text>

          <View style={styles.featureRow}>
            <TouchableOpacity
              style={styles.featureCard}
              onPress={() => openCamera("read")}
              accessibilityRole="button"
              accessibilityLabel="Smart Read"
            >
              <Text style={styles.featureIcon}>▤</Text>
              <Text style={styles.featureTitle}>
                Smart Read
              </Text>
              <Text style={styles.featureDescription}>
                Read text aloud
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.featureCard}
              onPress={() => openCamera("ask")}
              accessibilityRole="button"
              accessibilityLabel="Ask Percevia"
            >
              <Text style={styles.featureIcon}>✧</Text>
              <Text style={styles.featureTitle}>
                Ask Percevia
              </Text>
              <Text style={styles.featureDescription}>
                Understand what you see
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.voiceCard}>
            <Text style={styles.voiceTitle}>
              Designed to listen.
            </Text>
            <Text style={styles.voiceDescription}>
              Simple interactions. Clear responses.
              A more accessible everyday experience.
            </Text>
          </View>

          <Text style={styles.footer}>
            PERCEVIA • BUILT FOR ACCESSIBILITY
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // CAMERA PERMISSIONS
  if (!permission) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color="#20CDB7" size="large" />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionContainer}>
          <Text style={styles.heading}>
            Camera access required
          </Text>

          <Text style={styles.description}>
            Percevia needs camera access to understand
            your surroundings.
          </Text>

          <TouchableOpacity
            style={styles.mainButton}
            onPress={requestPermission}
          >
            <Text style={styles.mainButtonTitle}>
              Grant Camera Permission
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={goHome}
            style={styles.backButton}
          >
            <Text style={styles.backText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // CAMERA SCREEN
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={styles.cameraScroll}
        contentContainerStyle={styles.cameraScrollContent}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
      >
      <View style={styles.cameraHeader}>
        <TouchableOpacity
          onPress={goHome}
          accessibilityRole="button"
          accessibilityLabel="Back to home"
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.cameraBrand}>
          PERCEVIA
        </Text>

        <View style={{ width: 50 }} />
      </View>

      <Text style={styles.cameraTitle}>
        {modeTitle[mode]}
      </Text>

      <Text style={styles.cameraSubtitle}>
        {mode === "scene"
          ? "Keep your camera pointed around you for live scene updates."
          : mode === "read"
          ? "Position the text clearly inside the frame."
          : "Point your camera at something and ask a question. Percevia keeps its live view updated."}
      </Text>

      <View style={styles.previewContainer}>
        {photo && mode !== "ask" ? (
          <Image
            source={{ uri: photo }}
            style={styles.preview}
            resizeMode="contain"
            accessibilityLabel="Captured photograph"
          />
        ) : (
          <CameraView
            ref={cameraRef}
            style={styles.preview}
            facing="back"
          />
        )}
      </View>

      {mode === "ask" && (
        <>
          <TextInput
            style={styles.questionInput}
            placeholder="Ask about what the camera sees…"
            placeholderTextColor="#A9C7C9"
            value={question}
            onChangeText={setQuestion}
            multiline
            accessibilityLabel="Your question about the image"
          />
          <TouchableOpacity
            style={[styles.micButton, isListening && styles.micButtonActive]}
            onPress={isListening ? stopListening : startListening}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={isListening ? "Stop listening" : "Ask by voice"}
          >
            <Text style={styles.micButtonText}>
              {isListening ? "■  Stop listening" : "🎙  Ask by voice"}
            </Text>
          </TouchableOpacity>
          <Text style={styles.voiceHint}>
            {isListening
              ? "Listening… Speak naturally, then pause. The latest camera view will be analysed."
              : "The camera keeps updating in the background. Ask by voice or type a question — no photo needed."}
          </Text>
        </>
      )}

      {loading && (
        <ActivityIndicator
          color="#20CDB7"
          size="large"
        />
      )}

      {mode === "scene" ? (
        <>
          <View style={styles.liveStatusRow}>
            <View style={[styles.liveDot, monitoring && styles.liveDotActive]} />
            <Text style={styles.liveStatusText}>{liveStatus}</Text>
          </View>
          <TouchableOpacity
            style={styles.captureButton}
            onPress={monitoring ? stopMonitoring : startMonitoring}
            accessibilityRole="button"
            accessibilityLabel={monitoring ? "Pause live monitoring" : "Start live monitoring"}
          >
            <Text style={styles.captureText}>
              {monitoring ? "Ⅱ  Pause Live Monitoring" : "●  Start Live Monitoring"}
            </Text>
          </TouchableOpacity>
        </>
      ) : mode === "ask" ? (
        <>
          <View style={styles.liveStatusRow}>
            <View style={[styles.liveDot, monitoring && styles.liveDotActive]} />
            <Text style={styles.liveStatusText}>{liveStatus}</Text>
          </View>
          <TouchableOpacity
            style={[styles.captureButton, isListening && styles.micButtonActive]}
            onPress={isListening ? stopListening : startListening}
            disabled={loading}
          >
            <Text style={styles.captureText}>
              {isListening ? "■  Stop listening" : "🎙  Ask Percevia"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryAskButton}
            onPress={() => askAboutLiveView()}
            disabled={loading || !question.trim()}
          >
            <Text style={styles.actionText}>
              {loading ? "Thinking…" : "Send typed question"}
            </Text>
          </TouchableOpacity>
        </>
      ) : photo ? (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.retakeButton}
            onPress={retakePhoto}
          >
            <Text style={styles.actionText}>Retake</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.captureButton, styles.analyseButton]}
            onPress={processImage}
            disabled={loading}
          >
            <Text style={styles.captureText}>Analyse Image</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.captureButton}
          onPress={capturePhoto}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Capture photograph"
        >
          <Text style={styles.captureText}>
            {loading ? "Capturing…" : "● Capture Image"}
          </Text>
        </TouchableOpacity>
      )}

      {response !== "" && (
        <View style={styles.responseCard}>
          <Text style={styles.responseHeading}>
            PERCEVIA
          </Text>

          <Text style={styles.responseText}>
            {response}
          </Text>

          <TouchableOpacity
            onPress={speakResponse}
            style={styles.replayButton}
          >
            <Text style={styles.actionText}>
              ▶ Replay
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        onPress={goHome}
        style={styles.homeButton}
      >
        <Text style={styles.backText}>
          Return to Home
        </Text>
      </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#102C35",
  },

  homeContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 25,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 38,
  },

  brand: {
    fontSize: 23,
    fontWeight: "900",
    letterSpacing: 4,
    color: "#FFFFFF",
  },

  tagline: {
    fontSize: 13,
    color: "#A9C7C9",
    marginTop: 5,
  },

  logo: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: "#20CDB7",
    alignItems: "center",
    justifyContent: "center",
  },

  logoText: {
    color: "#102C35",
    fontSize: 24,
    fontWeight: "900",
  },

  hero: {
    marginBottom: 28,
  },

  accentLine: {
    width: 34,
    height: 3,
    backgroundColor: "#20CDB7",
    marginBottom: 15,
    borderRadius: 5,
  },

  heading: {
    fontSize: 34,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  headingAccent: {
    fontSize: 34,
    fontWeight: "800",
    color: "#20CDB7",
  },

  description: {
    fontSize: 15,
    lineHeight: 23,
    color: "#B7D0D1",
    marginTop: 12,
  },

  mainButton: {
    backgroundColor: "#20CDB7",
    minHeight: 145,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },

  cameraIcon: {
    fontSize: 30,
    color: "#102C35",
    marginBottom: 5,
  },

  mainButtonTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#102C35",
  },

  mainButtonSubtitle: {
    color: "#164B4B",
    fontSize: 13,
    marginTop: 5,
  },

  sectionTitle: {
    color: "#91B8B9",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    marginTop: 30,
    marginBottom: 14,
  },

  featureRow: {
    flexDirection: "row",
    gap: 12,
  },

  featureCard: {
    flex: 1,
    minHeight: 140,
    backgroundColor: "#1C414A",
    padding: 17,
    borderRadius: 18,
    justifyContent: "center",
  },

  featureIcon: {
    fontSize: 27,
    color: "#20CDB7",
    marginBottom: 10,
  },

  featureTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },

  featureDescription: {
    color: "#B7D0D1",
    fontSize: 12,
    marginTop: 5,
  },

  voiceCard: {
    marginTop: 20,
    padding: 19,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#315A62",
  },

  voiceTitle: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "700",
  },

  voiceDescription: {
    color: "#B7D0D1",
    fontSize: 13,
    lineHeight: 21,
    marginTop: 7,
  },

  footer: {
    textAlign: "center",
    color: "#73979A",
    fontSize: 9,
    letterSpacing: 1.3,
    marginTop: 24,
  },

  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    padding: 25,
    gap: 20,
  },

  cameraScroll: {
    flex: 1,
  },

  cameraScrollContent: {
    paddingBottom: 24,
  },

  cameraHeader: {
    paddingHorizontal: 22,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  cameraBrand: {
    color: "#20CDB7",
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 3,
  },

  cameraTitle: {
    fontSize: 23,
    fontWeight: "800",
    color: "#FFFFFF",
    paddingHorizontal: 22,
    marginTop: 12,
  },

  cameraSubtitle: {
    color: "#B7D0D1",
    paddingHorizontal: 22,
    marginTop: 7,
    marginBottom: 16,
    fontSize: 14,
  },

  previewContainer: {
    height: 420,
    minHeight: 320,
    marginHorizontal: 15,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#1C414A",
    borderWidth: 1,
    borderColor: "#35616A",
  },

  preview: {
    width: "100%",
    height: "100%",
  },

  questionInput: {
    marginHorizontal: 20,
    marginTop: 15,
    padding: 15,
    borderRadius: 14,
    backgroundColor: "#1C414A",
    color: "#FFFFFF",
    fontSize: 16,
  },

  micButton: {
    marginHorizontal: 22,
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#35616A",
    alignItems: "center",
  },

  micButtonActive: {
    backgroundColor: "#B94A58",
  },

  micButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },

  voiceHint: {
    color: "#A9C7C9",
    fontSize: 12,
    textAlign: "center",
    marginHorizontal: 24,
    marginTop: 8,
    marginBottom: 4,
  },

  liveStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    gap: 9,
  },

  liveDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#91B8B9",
  },

  liveDotActive: {
    backgroundColor: "#20CDB7",
  },

  liveStatusText: {
    color: "#B7D0D1",
    fontSize: 13,
  },

  captureButton: {
    marginHorizontal: 22,
    marginTop: 18,
    padding: 19,
    borderRadius: 16,
    backgroundColor: "#20CDB7",
    alignItems: "center",
  },

  captureText: {
    color: "#102C35",
    fontSize: 17,
    fontWeight: "800",
  },

  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginHorizontal: 22,
    marginTop: 18,
  },

  retakeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#20CDB7",
    borderRadius: 15,
    padding: 17,
    alignItems: "center",
  },

  analyseButton: {
    flex: 2,
    marginHorizontal: 0,
    marginTop: 0,
  },

  actionText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },

  captureButtonDummy: {
    flex: 2,
  },

  responseCard: {
    backgroundColor: "#1C414A",
    margin: 20,
    padding: 18,
    borderRadius: 16,
  },

  responseHeading: {
    color: "#20CDB7",
    fontWeight: "800",
    marginBottom: 10,
  },

  responseText: {
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 24,
  },

  replayButton: {
    backgroundColor: "#28535B",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 15,
  },

  backButton: {
    alignItems: "center",
    padding: 15,
  },

  backText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },

  homeButton: {
    alignItems: "center",
    padding: 15,
    marginBottom: 5,
  },

  secondaryAskButton: {
  marginHorizontal: 22,
  marginTop: 10,
  marginBottom: 12,
  paddingVertical: 13,
  borderRadius: 14,
  backgroundColor: "#1C414A",
  borderWidth: 1,
  borderColor: "#397C70",
  alignItems: "center",
  justifyContent: "center",
},
});
