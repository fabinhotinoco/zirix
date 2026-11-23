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


HDR_TRC = {"arib-std-b67", "smpte2084"}  # HLG e PQ (Dolby Vision/HDR10)


def transferencia_de_cor(caminho: Path) -> str:
    r = _rodar(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                "stream=color_transfer", "-of", "default=nw=1:nk=1", str(caminho)])
    return r.stdout.strip()


def normalizar_cfr(src: Path, dst: Path, fps: int = 30) -> Path:
    """Converte para taxa de quadros constante (o iPhone grava com taxa variável).

    Recusa vídeo HDR: o iPhone grava HLG/Dolby Vision por padrão e a conversão
    para 8 bits sem tonemapping deixa as cores lavadas e diferentes entre A e B.
    Grave com HDR desligado (ver producao/README.md).
    """
    if transferencia_de_cor(src) in HDR_TRC:
        raise ValueError(f"{src}: vídeo gravado em HDR. Desligue o HDR no iPhone e grave de novo.")
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
                        taxa: int = 48000, bloco_seg: float = 30.0) -> Path:
    """Coloca um áudio no relógio da câmera A: corrige a deriva, desloca e corta.

    Mapa de tempo: o instante t da câmera A corresponde a u = t(1 - deriva) - atraso
    no relógio do áudio. A reamostragem é feita em numpy, por interpolação, em
    blocos e sobre arquivo mapeado em disco (60 min a 48 kHz não cabem confortáveis
    em memória). Os filtros do ffmpeg não servem aqui: o `asetrate` arredonda a
    taxa para 1 Hz (~20 ppm) e o `atempo` ignora variações tão pequenas.
    Saída em float 32 para não cortar picos acima de 0 dBFS do transmissor.
    """
    import tempfile as _tmp
    with _tmp.TemporaryDirectory() as tmp:
        bruto = Path(tmp) / "entrada.f32"
        _ffmpeg("-i", str(src), "-ac", "1", "-ar", str(taxa), "-f", "f32le", str(bruto))
        entrada = np.memmap(bruto, dtype="<f4", mode="r") if bruto.stat().st_size else np.zeros(1, "<f4")
        total = int(round(duracao_ref * taxa))
        saida_bruta = Path(tmp) / "saida.f32"
        with open(saida_bruta, "wb") as out:
            passo = int(bloco_seg * taxa)
            for n0 in range(0, total, passo):
                n = np.arange(n0, min(n0 + passo, total), dtype=np.float64)
                pos = (n / taxa * (1 - deriva) - atraso) * taxa  # posição no áudio de origem
                lo = max(0, int(np.floor(pos[0])) - 1)
                hi = min(len(entrada), int(np.ceil(pos[-1])) + 2)
                if hi <= lo:
                    out.write(np.zeros(len(n), "<f4").tobytes())
                    continue
                trecho = np.asarray(entrada[lo:hi], dtype=np.float64)
                indices_entrada = np.arange(lo, hi, dtype=np.float64)
                valores = np.interp(pos, indices_entrada, trecho, left=0.0, right=0.0)
                out.write(valores.astype("<f4").tobytes())
        del entrada
        _ffmpeg("-f", "f32le", "-ar", str(taxa), "-ac", "1", "-i", str(saida_bruta),
                "-c:a", "pcm_f32le", str(dst))
    return Path(dst)
