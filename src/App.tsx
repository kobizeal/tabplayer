import { useEffect, useState } from "react";
import { detectPitch } from "./pitch";

interface AudioInputDevice {
  deviceId: string;
  label: string;
}

function frequencyToNote(freq: number): { name: string; midi: number } | null {
  if (!freq || freq <= 0) return null;

  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  if (midi < 0 || midi > 127) return null;

  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const name = noteNames[midi % 12];
  const octave = Math.floor(midi / 12) - 1;

  return { name: `${name}${octave}`, midi };
}

function App() {
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<string>("");

  const [frequency, setFrequency] = useState<number | null>(null);
  const [noteName, setNoteName] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);

  // 1) Get list of audio input devices
  useEffect(() => {
    async function getDevices() {
      try {
        // Request permission once so we can see device labels
        await navigator.mediaDevices.getUserMedia({ audio: true });

        const all = await navigator.mediaDevices.enumerateDevices();
        const inputs = all
          .filter((d) => d.kind === "audioinput")
          .map((d) => ({
            deviceId: d.deviceId,
            label: d.label || "Audio input",
          }));
        setDevices(inputs);
      } catch (e: any) {
        setDeviceError(e?.message || "Could not access audio devices");
      }
    }
    getDevices();
  }, []);

  // 2) Start audio processing whenever a device is selected
  useEffect(() => {
    if (!selectedDevice) return;

    let audioCtx: AudioContext | null = null;
    let processor: ScriptProcessorNode | null = null;
    let stream: MediaStream | null = null;

    const start = async () => {
      try {
        setAudioError(null);
        setIsListening(true);

        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: selectedDevice },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });

        audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const bufferSize = 2048;

        processor = audioCtx.createScriptProcessor(bufferSize, 1, 1);

// smoothing + hold logic
let recentFreqs: number[] = [];
let lastGoodFreq: number | null = null;
let lastGoodTime = 0;
let nullFrameCount = 0;
const frameDurationMs = (bufferSize / audioCtx.sampleRate) * 1000;
const HOLD_MS = 250;        // how long to keep last note after signal drops
const WINDOW = 5;           // how many frames to smooth over

processor.onaudioprocess = (event) => {
  const input = event.inputBuffer.getChannelData(0);
  const rawFreq = detectPitch(input, audioCtx!.sampleRate);
  const now = performance.now();

  if (rawFreq) {
    // we got a pitch this frame
    nullFrameCount = 0;
    lastGoodTime = now;

    // add to smoothing window
    recentFreqs.push(rawFreq);
    if (recentFreqs.length > WINDOW) {
      recentFreqs.shift();
    }

    // median smoothing
    const sorted = [...recentFreqs].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    lastGoodFreq = median;
    setFrequency(median);

    const note = frequencyToNote(median);
    setNoteName(note ? note.name : null);
  } else {
    // no pitch detected for this frame
    nullFrameCount++;

    // if we recently had a good note, keep showing it for a bit
    if (lastGoodFreq && now - lastGoodTime < HOLD_MS) {
      return; // do nothing, keep last note on screen
    }

    // if we've been "null" for long enough, clear the display
    if (nullFrameCount * frameDurationMs > HOLD_MS) {
      lastGoodFreq = null;
      recentFreqs = [];
      setFrequency(null);
      setNoteName(null);
    }
  }
};


        source.connect(processor);
        processor.connect(audioCtx.destination); // you can omit this if you don't want monitoring
      } catch (e: any) {
        setAudioError(e?.message || "Error starting audio");
        setIsListening(false);
      }
    };

    start();

    return () => {
      processor?.disconnect();
      if (audioCtx && audioCtx.state !== "closed") {
        audioCtx.close();
      }
      stream?.getTracks().forEach((t) => t.stop());
      setIsListening(false);
    };
  }, [selectedDevice]);

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "2rem",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        background: "#0f172a",
        color: "#e5e7eb",
      }}
    >
      <h1 style={{ fontSize: "2rem", marginBottom: "1rem" }}>Guitar Trainer – Prototype</h1>
      <p style={{ marginBottom: "2rem", color: "#9ca3af" }}>
        Plug your electric guitar into an audio interface, select it below, and pluck a single note.
      </p>

      <section
        style={{
          marginBottom: "2rem",
          padding: "1.5rem",
          borderRadius: "0.75rem",
          background: "#111827",
          border: "1px solid #1f2937",
        }}
      >
        <h2 style={{ marginBottom: "0.75rem", fontSize: "1.2rem" }}>
          1. Choose your guitar input device
        </h2>
        {deviceError && <p style={{ color: "#f87171" }}>{deviceError}</p>}

        {devices.length === 0 ? (
          <p>No audio inputs found. Make sure your interface is plugged in and allow mic access.</p>
        ) : (
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: "0.5rem",
              border: "1px solid #4b5563",
              background: "#020617",
              color: "#e5e7eb",
            }}
          >
            <option value="">Select audio input…</option>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
        )}
      </section>

      <section
        style={{
          padding: "1.5rem",
          borderRadius: "0.75rem",
          background: "#111827",
          border: "1px solid #1f2937",
        }}
      >
        <h2 style={{ marginBottom: "0.75rem", fontSize: "1.2rem" }}>2. Live pitch</h2>
        {audioError && <p style={{ color: "#f87171" }}>{audioError}</p>}
        {!selectedDevice && <p>Select a device to start listening.</p>}

        {selectedDevice && (
          <>
            <p style={{ marginBottom: "0.5rem" }}>
              Status:{" "}
              <span style={{ color: isListening ? "#4ade80" : "#f97316" }}>
                {isListening ? "Listening…" : "Idle"}
              </span>
            </p>
            <p style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>
              {noteName ? noteName : "—"}
            </p>
            <p style={{ color: "#9ca3af" }}>
              {frequency ? `${frequency.toFixed(1)} Hz` : "Play a single note on your guitar…"}
            </p>
          </>
        )}
      </section>
    </div>
  );
}

export default App;
