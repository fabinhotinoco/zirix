"""Montagem do episódio horizontal: base na câmera A, inserções da câmera B.

Regra determinística (ajustável): logo depois de cada troca de falante e a cada
`fala_longa` segundos de uma mesma fala, mostra a câmera B por `insercao`
segundos, nunca voltando para B antes de `min_a` segundos de A e só onde a
câmera B estava gravando.
"""
from __future__ import annotations

import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from producao.episodio import Episodio
from producao.falantes import Trecho
from producao.midia import normalizar_loudness
from producao.sincronia import Alinhamento, tempo_em_outro

LARGURA, ALTURA, FPS = 1920, 1080, 30


@dataclass(frozen=True)
class Plano:
    inicio: float
    fim: float
    camera: str  # "A" ou "B", tempos na linha do tempo da câmera A


def _candidatos(falantes: list[Trecho], fala_longa: float, insercao: float, min_a: float) -> list[float]:
    pontos = []
    for i, t in enumerate(falantes):
        if i > 0:
            pontos.append(t.inicio)
        k = 1
        while t.inicio + k * fala_longa + insercao + min_a <= t.fim:
            pontos.append(t.inicio + k * fala_longa)
            k += 1
    return sorted(set(pontos))


def decidir_planos(falantes: list[Trecho], duracao: float, cobertura_b: tuple[float, float] | None,
                   fala_longa: float = 25.0, insercao: float = 6.0, min_a: float = 8.0) -> list[Plano]:
    inserts: list[tuple[float, float]] = []
    if cobertura_b is not None:
        b_ini, b_fim = cobertura_b
        ultimo_fim = 0.0
        for t in _candidatos(falantes, fala_longa, insercao, min_a):
            ini, fim = t, min(t + insercao, duracao)
            if ini < b_ini or fim > b_fim or fim - ini < insercao:
                continue
            if ini - ultimo_fim < min_a:
                continue
            inserts.append((ini, fim))
            ultimo_fim = fim

    planos, cursor = [], 0.0
    for ini, fim in inserts:
        if ini > cursor:
            planos.append(Plano(cursor, ini, "A"))
        planos.append(Plano(ini, fim, "B"))
        cursor = fim
    if cursor < duracao:
        planos.append(Plano(cursor, duracao, "A"))
    return planos


def _ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *args], check=True)


def _segmento(src: Path, inicio: float, dur: float, dst: Path) -> None:
    filtro = (f"scale={LARGURA}:{ALTURA}:force_original_aspect_ratio=decrease,"
              f"pad={LARGURA}:{ALTURA}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={FPS}")
    _ffmpeg("-ss", f"{inicio:.3f}", "-i", str(src), "-t", f"{dur:.3f}", "-an", "-vf", filtro,
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", str(dst))


def renderizar(ep: Episodio, planos: list[Plano], al_b: Alinhamento | None, audio: Path,
               saida: Path, corte_inicio: float, corte_fim: float) -> Path:
    """Vídeo 1920x1080 a 30 fps com o áudio final, entre corte_inicio e corte_fim."""
    with tempfile.TemporaryDirectory() as tmp:
        partes = []
        for i, p in enumerate(planos):
            ini, fim = max(p.inicio, corte_inicio), min(p.fim, corte_fim)
            if fim - ini <= 0:
                continue
            if p.camera == "B" and ep.camera_b is not None:
                src = ep.camera_b
                ini_src = tempo_em_outro(ini, al_b) if al_b else ini
            else:
                src, ini_src = ep.camera_a, ini
            parte = Path(tmp) / f"p{i:05d}.mp4"
            _segmento(src, ini_src, fim - ini, parte)
            partes.append(parte)
        lista = Path(tmp) / "lista.txt"
        lista.write_text("".join(f"file '{p}'\n" for p in partes), encoding="utf-8")
        _ffmpeg("-f", "concat", "-safe", "0", "-i", str(lista),
                "-ss", f"{corte_inicio:.3f}", "-t", f"{corte_fim - corte_inicio:.3f}", "-i", str(audio),
                "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                "-shortest", str(saida))
    return Path(saida)


def mixar_lapelas(faixas_alinhadas: dict[str, Path], saida: Path) -> Path:
    """Soma as lapelas (já alinhadas à câmera A) e normaliza em -16 LUFS."""
    with tempfile.TemporaryDirectory() as tmp:
        bruto = Path(tmp) / "mix.wav"
        entradas = [arg for f in faixas_alinhadas.values() for arg in ("-i", str(f))]
        _ffmpeg(*entradas, "-filter_complex",
                f"amix=inputs={len(faixas_alinhadas)}:normalize=0:duration=longest",
                "-ac", "1", "-ar", "48000", "-c:a", "pcm_f32le", str(bruto))
        return normalizar_loudness(bruto, saida)
