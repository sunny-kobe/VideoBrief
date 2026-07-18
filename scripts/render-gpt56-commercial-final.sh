#!/bin/zsh
set -euo pipefail

ROOT="${0:A:h:h}"
FFMPEG="$ROOT/scripts/hyperframes-ffmpeg/ffmpeg"
WORK="$ROOT/output/videos/gpt-5-6-commercial-short-work"
SUBTITLES="$ROOT/content/projects/gpt-5-6-commercial-short/commercial.ass"
SOURCE_DIR="$ROOT/public/project-assets/gpt-5-6-agentic-work"
OUTPUT="$ROOT/output/videos/gpt-5-6-commercial-short-final.mp4"
PUBLIC="$ROOT/public/renders/gpt-5-6-commercial-short-final.mp4"
DURATION="43.79"

SOURCES=(
  "01-launch-presenter.mp4"
  "02-game-build.mp4"
  "03-programmatic-tools.mp4"
  "04-subagents.mp4"
  "05-computer-browser-use.mp4"
  "06-pr-workflow.mp4"
)

for source in "${SOURCES[@]}"; do
  if [[ ! -f "$SOURCE_DIR/$source" ]]; then
    print -u2 "Missing local review asset: $SOURCE_DIR/$source"
    print -u2 "See content/projects/gpt-5-6-commercial-short/README.md."
    exit 1
  fi
done

if [[ ! -f "$WORK/voiceover-synced.aiff" ]]; then
  print -u2 "Missing generated voiceover: $WORK/voiceover-synced.aiff"
  print -u2 "Run the base narration command from content/projects/gpt-5-6-commercial-short/README.md."
  exit 1
fi

mkdir -p "$WORK" "${PUBLIC:h}"

"$FFMPEG" -y \
  -i "$SOURCE_DIR/${SOURCES[1]}" \
  -i "$SOURCE_DIR/${SOURCES[2]}" \
  -i "$SOURCE_DIR/${SOURCES[3]}" \
  -i "$SOURCE_DIR/${SOURCES[4]}" \
  -i "$SOURCE_DIR/${SOURCES[5]}" \
  -i "$SOURCE_DIR/${SOURCES[6]}" \
  -i "$WORK/voiceover-synced.aiff" \
  -f lavfi -t "$DURATION" -i "sine=frequency=55:sample_rate=48000" \
  -f lavfi -t "$DURATION" -i "anoisesrc=color=pink:sample_rate=48000:seed=20260718" \
  -filter_complex "
    [1:v]trim=start=0.00:duration=0.35,setpts=PTS-STARTPTS,scale=1080:1920,format=yuv420p[h0];
    [4:v]trim=start=0.40:duration=0.35,setpts=PTS-STARTPTS,scale=1080:1920,format=yuv420p[h1];
    [5:v]trim=start=2.00:duration=0.35,setpts=PTS-STARTPTS,scale=1080:1920,format=yuv420p[h2];
    [0:v]trim=start=0.70:duration=3.77,setpts=PTS-STARTPTS,scale=1080:1920,format=yuv420p[h3];
    [1:v]trim=start=0.00:duration=7.40,setpts=PTS-STARTPTS,scale=1080:1920,format=yuv420p[v1];
    [2:v]trim=start=1.20:duration=7.00,setpts=PTS-STARTPTS,scale=1080:1920,format=yuv420p[v2];
    [3:v]trim=start=0.00:duration=7.36,setpts=PTS-STARTPTS,scale=1080:1920,format=yuv420p[v3];
    [4:v]trim=start=0.40:duration=7.40,setpts=PTS-STARTPTS,scale=1080:1920,format=yuv420p[v4];
    [5:v]trim=start=0.00:duration=9.81,setpts=PTS-STARTPTS,scale=1080:1920,format=yuv420p[v5];
    [h0][h1][h2][h3][v1][v2][v3][v4][v5]concat=n=9:v=1:a=0,
      fps=30,eq=contrast=1.03:saturation=1.04:brightness=-0.008,
      unsharp=5:5:0.22:5:5:0,
      drawbox=x=0:y=1385:w=1080:h=535:color=black@0.52:t=fill,
      drawbox=x=0:y=1908:w='min(1080,1080*t/$DURATION)':h=12:color=0xFFE64D@1:t=fill,
      subtitles='$SUBTITLES':fontsdir='/System/Library/Fonts',format=yuv420p[vout];
    [6:a]aresample=48000,volume=1.0[voice];
    [7:a]lowpass=f=170,highpass=f=35,volume=0.027[bass];
    [8:a]asplit=6[air0][s1][s2][s3][s4][s5];
    [air0]highpass=f=120,lowpass=f=1500,volume=0.004[air];
    [s1]atrim=0:0.16,highpass=f=2800,lowpass=f=9000,afade=t=out:st=0:d=0.16,volume=0.035,pan=stereo|c0=c0|c1=c0,adelay=4820|4820[w1];
    [s2]atrim=0:0.16,highpass=f=2800,lowpass=f=9000,afade=t=out:st=0:d=0.16,volume=0.035,pan=stereo|c0=c0|c1=c0,adelay=12220|12220[w2];
    [s3]atrim=0:0.16,highpass=f=2800,lowpass=f=9000,afade=t=out:st=0:d=0.16,volume=0.035,pan=stereo|c0=c0|c1=c0,adelay=19220|19220[w3];
    [s4]atrim=0:0.16,highpass=f=2800,lowpass=f=9000,afade=t=out:st=0:d=0.16,volume=0.035,pan=stereo|c0=c0|c1=c0,adelay=26580|26580[w4];
    [s5]atrim=0:0.16,highpass=f=2800,lowpass=f=9000,afade=t=out:st=0:d=0.16,volume=0.035,pan=stereo|c0=c0|c1=c0,adelay=33980|33980[w5];
    [voice][bass][air][w1][w2][w3][w4][w5]amix=inputs=8:duration=longest:normalize=0,
      highpass=f=35,loudnorm=I=-14:LRA=7:TP=-1.0[aout]
  " \
  -map '[vout]' -map '[aout]' -t "$DURATION" \
  -c:v libx264 -preset slow -crf 17 -profile:v high -level 4.2 \
  -pix_fmt yuv420p -r 30 -g 60 \
  -c:a aac -b:a 192k -ar 48000 -ac 2 \
  -movflags +faststart "$OUTPUT"

cp "$OUTPUT" "$PUBLIC"

echo "$OUTPUT"
