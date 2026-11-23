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


RAIZ_REPO = Path(__file__).resolve().parents[2]


def rodar_cli(args: list[str], raiz: Path) -> subprocess.CompletedProcess:
    """Roda `python -m producao --raiz <raiz> ...` a partir do repositório."""
    import os
    import sys
    env = {**os.environ, "PYTHONPATH": str(RAIZ_REPO)}
    return subprocess.run([sys.executable, "-m", "producao", "--raiz", str(raiz), *args],
                          cwd=RAIZ_REPO, env=env, capture_output=True, text=True)


def voz(segundos: float, taxa: int, freq: float = 180.0) -> np.ndarray:
    """Tom com envelope irregular (sílabas aleatórias): não periódico, como a fala.

    Envelope periódico deixaria a sincronia ambígua (vários picos de correlação).
    """
    n = int(segundos * taxa)
    t = np.arange(n) / taxa
    silaba = taxa // 8
    env = np.repeat(np.random.default_rng(int(freq)).uniform(0.2, 1.0, n // silaba + 1), silaba)[:n]
    return (0.3 * np.sin(2 * np.pi * freq * t) * env).astype(np.float32)


def silencio(segundos: float, taxa: int) -> np.ndarray:
    return (0.001 * np.random.default_rng(1).normal(size=int(segundos * taxa))).astype(np.float32)


def montar_episodio_sintetico(raiz: Path, codigo: str = "EP99", com_b: bool = True) -> Path:
    """40 s: fabio fala 0-20 s, saulo 20-40 s. Câmera B começa 2 s depois da A.

    Lapelas começam 1 s depois da A (como um transmissor ligado depois).
    """
    taxa = 48000
    pasta = raiz / "trabalho" / codigo
    pasta.mkdir(parents=True, exist_ok=True)
    fabio = np.concatenate([voz(20, taxa, 180), silencio(20, taxa)])
    saulo = np.concatenate([silencio(20, taxa), voz(20, taxa, 260)])
    mix = gravar_pcm16(pasta / "mix_camera.wav", 0.5 * (fabio + saulo), taxa)
    gravar_pcm16(pasta / "tx1.wav", fabio[taxa:], taxa)
    gravar_pcm16(pasta / "tx2.wav", saulo[taxa:], taxa)
    rodar("ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i",
          "testsrc2=size=1280x720:rate=30:duration=40", "-i", str(mix), "-c:v", "libx264",
          "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(pasta / "camera_a.mp4"))
    if com_b:
        rodar("ffmpeg", "-y", "-loglevel", "error", "-ss", "2", "-i", str(pasta / "camera_a.mp4"),
              "-vf", "hue=h=90", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
              str(pasta / "camera_b.mp4"))
    yaml_ep = raiz / "episodios" / codigo / "episodio.yaml"
    yaml_ep.parent.mkdir(parents=True, exist_ok=True)
    yaml_ep.write_text(
        f"codigo: {codigo}\ntitulo: Sintetico\ncamera_a: camera_a.mp4\n"
        + ("camera_b: camera_b.mp4\n" if com_b else "")
        + "falantes:\n  fabio: {arquivo: tx1.wav, nome: Fabio}\n  saulo: {arquivo: tx2.wav, nome: Saulo}\n"
        "enquadramento:\n  fabio: {x: 400, y: 0, w: 1216, h: 2160}\n  saulo: {x: 2200, y: 0, w: 1216, h: 2160}\n",
        encoding="utf-8")
    return pasta
