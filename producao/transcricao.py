"""Transcrição com faster-whisper (CPU, int8) e texto por falante.

O texto com tempos é o que o Claude lê para propor os cortes de cada episódio.
"""
from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path

from producao.falantes import Trecho


@dataclass(frozen=True)
class Palavra:
    inicio: float
    fim: float
    texto: str


def transcrever(wav: Path, modelo: str = "small", idioma: str = "pt") -> list[Palavra]:
    # O download pelo protocolo Xet exige hosts extras; o modo tradicional usa só
    # huggingface.co e a CDN liberada no ambiente.
    os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
    from faster_whisper import WhisperModel  # import tardio: pesado e só usado aqui

    m = WhisperModel(modelo, device="cpu", compute_type="int8")
    segmentos, _ = m.transcribe(str(wav), language=idioma, word_timestamps=True, vad_filter=True)
    return [Palavra(float(w.start), float(w.end), w.word.strip())
            for seg in segmentos for w in (seg.words or []) if w.word.strip()]


def salvar(palavras: list[Palavra], caminho: Path) -> None:
    Path(caminho).write_text(json.dumps([asdict(p) for p in palavras], ensure_ascii=False),
                             encoding="utf-8")


def carregar(caminho: Path) -> list[Palavra]:
    return [Palavra(**d) for d in json.loads(Path(caminho).read_text(encoding="utf-8"))]


def _carimbo(segundos: float) -> str:
    s = int(segundos)
    h, m, s = s // 3600, (s % 3600) // 60, s % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def _falante_em(t: float, falantes: list[Trecho]) -> str:
    for tr in falantes:
        if tr.inicio <= t < tr.fim:
            return tr.falante
    return falantes[-1].falante if falantes else "?"


def texto_com_tempos(palavras: list[Palavra], falantes: list[Trecho], nomes: dict[str, str]) -> str:
    """Uma linha por troca de falante: '[mm:ss] Nome: texto'."""
    linhas: list[tuple[float, str, list[str]]] = []
    for p in palavras:
        quem = _falante_em((p.inicio + p.fim) / 2, falantes)
        if linhas and linhas[-1][1] == quem:
            linhas[-1][2].append(p.texto)
        else:
            linhas.append((p.inicio, quem, [p.texto]))
    return "\n".join(f"[{_carimbo(t)}] {nomes.get(q, q)}: {' '.join(ws)}" for t, q, ws in linhas)
