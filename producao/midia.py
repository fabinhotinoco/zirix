"""Chamadas ao ffmpeg/ffprobe e leitura de WAV."""
from __future__ import annotations

import json
import re
import subprocess
import wave
from pathlib import Path

import numpy as np


def _rodar(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(args, check=True, capture_output=True, text=True)


def _ffmpeg(*args: str) -> subprocess.CompletedProcess:
    return _rodar(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *args])


def duracao(caminho: Path) -> float:
    r = _rodar(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "default=nw=1:nk=1", str(caminho)])
    return float(r.stdout.strip())


def extrair_audio(src: Path, dst: Path, taxa: int = 16000) -> Path:
    """WAV mono PCM 16-bit."""
    _ffmpeg("-i", str(src), "-vn", "-ac", "1", "-ar", str(taxa), "-c:a", "pcm_s16le", str(dst))
    return Path(dst)


def ler_wav(caminho: Path) -> tuple[np.ndarray, int]:
    """Lê WAV PCM 16/24/32 ou float 32 e devolve float32 mono em -1..1."""
    bruto = Path(caminho).read_bytes()
    if bruto[:4] != b"RIFF" or bruto[8:12] != b"WAVE":
        raise ValueError(f"{caminho}: não é WAV")
    pos, fmt, dados = 12, None, None
    while pos + 8 <= len(bruto):
        nome = bruto[pos:pos + 4]
        tam = int.from_bytes(bruto[pos + 4:pos + 8], "little")
        corpo = bruto[pos + 8:pos + 8 + tam]
        if nome == b"fmt ":
            fmt = corpo
        elif nome == b"data":
            dados = corpo
        pos += 8 + tam + (tam % 2)
    if fmt is None or dados is None:
        raise ValueError(f"{caminho}: WAV sem fmt/data")
    formato = int.from_bytes(fmt[0:2], "little")
    canais = int.from_bytes(fmt[2:4], "little")
    taxa = int.from_bytes(fmt[4:8], "little")
    bits = int.from_bytes(fmt[14:16], "little")
    if formato == 0xFFFE:  # WAVE_FORMAT_EXTENSIBLE: subformato nos 2 primeiros bytes do GUID
        formato = int.from_bytes(fmt[24:26], "little")

    if formato == 3 and bits == 32:
        amostras = np.frombuffer(dados, dtype="<f4")
    elif formato == 1 and bits == 16:
        amostras = np.frombuffer(dados, dtype="<i2").astype(np.float32) / 32768.0
    elif formato == 1 and bits == 24:
        b = np.frombuffer(dados[: len(dados) // 3 * 3], dtype=np.uint8).reshape(-1, 3)
        inteiro = (b[:, 0].astype(np.int32) | (b[:, 1].astype(np.int32) << 8)
                   | (b[:, 2].astype(np.int32) << 16))
        inteiro = np.where(inteiro >= 1 << 23, inteiro - (1 << 24), inteiro)
        amostras = inteiro.astype(np.float32) / float(1 << 23)
    elif formato == 1 and bits == 32:
        amostras = np.frombuffer(dados, dtype="<i4").astype(np.float32) / float(1 << 31)
    else:
        raise ValueError(f"{caminho}: formato WAV não suportado ({formato}, {bits} bits)")

    if canais > 1:
        amostras = amostras[: len(amostras) // canais * canais].reshape(-1, canais).mean(axis=1)
    return np.ascontiguousarray(amostras, dtype=np.float32), taxa


def gravar_wav(caminho: Path, sinal: np.ndarray, taxa: int) -> Path:
    """Grava WAV mono PCM 16-bit."""
    dados = (np.clip(sinal, -1.0, 1.0) * 32767).astype("<i2")
    with wave.open(str(caminho), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(taxa)
        w.writeframes(dados.tobytes())
    return Path(caminho)


def normalizar_cfr(src: Path, dst: Path, fps: int = 30) -> Path:
    """Converte para taxa de quadros constante (o iPhone grava com taxa variável)."""
    _ffmpeg("-i", str(src), "-vf", f"fps={fps}", "-fps_mode", "cfr", "-r", str(fps),
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k", str(dst))
    return Path(dst)


def medir_lufs(caminho: Path) -> float:
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(caminho),
                        "-af", "ebur128", "-f", "null", "-"],
                       capture_output=True, text=True, check=True)
    achados = re.findall(r"I:\s+(-?[\d.]+)\s+LUFS", r.stderr)
    if not achados:
        raise RuntimeError(f"{caminho}: ebur128 não devolveu loudness integrado")
    return float(achados[-1])


def normalizar_loudness(src: Path, dst: Path, alvo: float = -16.0) -> Path:
    """loudnorm em duas passagens (medição + aplicação linear)."""
    filtro = f"loudnorm=I={alvo}:TP=-1.5:LRA=11"
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(src), "-af",
                        filtro + ":print_format=json", "-f", "null", "-"],
                       capture_output=True, text=True, check=True)
    medida = json.loads(r.stderr[r.stderr.rindex("{"):r.stderr.rindex("}") + 1])
    segundo = (f"{filtro}:measured_I={medida['input_i']}:measured_TP={medida['input_tp']}"
               f":measured_LRA={medida['input_lra']}:measured_thresh={medida['input_thresh']}"
               f":offset={medida['target_offset']}:linear=true")
    _ffmpeg("-i", str(src), "-af", segundo, "-ar", "48000", str(dst))
    return Path(dst)


def aplicar_alinhamento(src: Path, dst: Path, atraso: float, deriva: float, duracao_ref: float,
                        taxa: int = 48000) -> Path:
    """Coloca um áudio no relógio da câmera A: corrige a deriva, desloca e corta.

    `atraso` > 0: o áudio começou depois da A (ganha silêncio no início).
    """
    filtros = [f"aresample={taxa}", f"asetrate={taxa * (1 - deriva):.6f}", f"aresample={taxa}"]
    if atraso >= 0:
        filtros.append(f"adelay={int(round(atraso * 1000))}:all=1")
    else:
        filtros += [f"atrim=start={-atraso:.4f}", "asetpts=PTS-STARTPTS"]
    filtros += ["apad", f"atrim=end={duracao_ref:.4f}"]
    _ffmpeg("-i", str(src), "-af", ",".join(filtros), "-ac", "1", "-c:a", "pcm_s16le", str(dst))
    return Path(dst)
