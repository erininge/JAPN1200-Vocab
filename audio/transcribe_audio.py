from faster_whisper import WhisperModel
from pathlib import Path
import csv

audio_dir = Path("audio")
wav_files = sorted(audio_dir.glob("*.wav"))

model = WhisperModel("small", device="cpu", compute_type="int8")

with open("audio_transcripts.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["file_name", "transcript"])
    for wav in wav_files:
        segments, info = model.transcribe(
            str(wav),
            language="ja",
            beam_size=5,
            condition_on_previous_text=False
        )
        text = "".join(segment.text for segment in segments).strip()
        writer.writerow([wav.name, text])
        print(wav.name, "->", text)

print("DONE")
