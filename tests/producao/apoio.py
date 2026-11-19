"""Utilidades de teste: geração de mídia sintética e leitura com ffprobe."""
import json
import subprocess
import wave
from pathlib import Path

import numpy as np


def rodar(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(list(args), check=True, capture_output=True, text=True)


def gerar_video(destino: Path, segundos: float = 10, largura: int = 1280, altura: int = 720,
                freq: int = 440, vfr: bool = False) -> Path:
    """Vídeo de teste com áudio seno. Com vfr=True, gera taxa de quadros variável."""
    filtro = f"testsrc2=size={largura}x{altura}:rate=30:duration={segundos}"
    args = ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", filtro,
            "-f", "lavfi", "-i", f"sine=frequency={freq}:duration={segundos}:sample_rate=48000"]
    if vfr:
        args += ["-vf", "select='not(mod(n\\,3))+lt(t\\,2)'", "-fps_mode", "vfr"]
    args += ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(destino)]
    rodar(*args)
    return destino


def gravar_pcm16(destino: Path, sinal: np.ndarray, taxa: int) -> Path:
    dados = (np.clip(sinal, -1, 1) * 32767).astype("<i2")
    with wave.open(str(destino), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(taxa)
        w.writeframes(dados.tobytes())
    return destino


def gravar_float32(destino: Path, sinal: np.ndarray, taxa: int) -> Path:
    """WAV IEEE float 32-bit (formato 3), como o gravado pelo transmissor."""
    dados = np.asarray(sinal, dtype="<f4").tobytes()
    cabecalho_fmt = (b"fmt " + (18).to_bytes(4, "little") + (3).to_bytes(2, "little")
                     + (1).to_bytes(2, "little") + taxa.to_bytes(4, "little")
                     + (taxa * 4).to_bytes(4, "little") + (4).to_bytes(2, "little")
                     + (32).to_bytes(2, "little") + (0).to_bytes(2, "little"))
    fact = b"fact" + (4).to_bytes(4, "little") + (len(sinal)).to_bytes(4, "little")
    data = b"data" + len(dados).to_bytes(4, "little") + dados
    corpo = b"WAVE" + cabecalho_fmt + fact + data
    destino.write_bytes(b"RIFF" + len(corpo).to_bytes(4, "little") + corpo)
    return destino


def ffprobe_stream(caminho: Path, tipo: str = "v") -> dict:
    r = rodar("ffprobe", "-v", "error", "-select_streams", f"{tipo}:0", "-show_streams",
              "-of", "json", str(caminho))
    return json.loads(r.stdout)["streams"][0]


def ffprobe_campo(caminho: Path, campo: str) -> str:
    return str(ffprobe_stream(caminho)[campo])


def ffprobe_resolucao(caminho: Path) -> tuple[int, int]:
    s = ffprobe_stream(caminho)
    return int(s["width"]), int(s["height"])
