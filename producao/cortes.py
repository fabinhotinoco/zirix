"""Cortes verticais (9:16) legendados, enquadrados em quem está falando.

A lista de cortes (episodios/EPxx/cortes.yaml) é proposta pelo Claude a partir
da transcrição e só é renderizada depois de aprovada (aprovado: true).
"""
from __future__ import annotations

import subprocess
import tempfile
from dataclasses import dataclass, replace
from pathlib import Path

import yaml

from producao.episodio import Episodio, Recorte
from producao.falantes import Trecho
from producao.transcricao import Palavra

ESTILO = Path(__file__).parent / "estilo"
LARGURA, ALTURA, FPS = 1080, 1920, 30
DURACAO_MIN, DURACAO_MAX = 30.0, 90.0
QTD_MIN, QTD_MAX = 4, 6
CARTELA_SEG = 3.0
LARGURA_REF_4K = 3840


@dataclass(frozen=True)
class Corte:
    id: str
    inicio: float
    fim: float
    titulo: str


def _yaml(caminho: Path) -> dict:
    return yaml.safe_load(Path(caminho).read_text(encoding="utf-8")) or {}


def aprovada(caminho: Path) -> bool:
    return _yaml(caminho).get("aprovado") is True


def ler_lista(caminho: Path) -> list[Corte]:
    cortes = [Corte(str(c["id"]), float(c["inicio"]), float(c["fim"]), str(c.get("titulo", "")))
              for c in _yaml(caminho).get("cortes") or []]
    for c in cortes:
        d = c.fim - c.inicio
        if not DURACAO_MIN <= d <= DURACAO_MAX:
            raise ValueError(f"corte {c.id} tem {d:.0f} s; o permitido é de 30 a 90 s")
    if not QTD_MIN <= len(cortes) <= QTD_MAX:
        raise ValueError(f"a lista tem {len(cortes)} cortes; o permitido é de 4 a 6 por episódio")
    return cortes


def ajustar_bordas(c: Corte, palavras: list[Palavra], folga: float = 0.15) -> Corte:
    """Leva início e fim para a borda de palavra mais próxima.

    A folga nunca passa da metade do intervalo até a palavra vizinha, para o
    corte não começar nem terminar dentro dela. Depois do ajuste, a duração é
    validada de novo (30 a 90 s).
    """
    if not palavras:
        return c
    ordem = sorted(palavras, key=lambda p: p.inicio)
    i = min(range(len(ordem)), key=lambda k: abs(ordem[k].inicio - c.inicio))
    j = min(range(len(ordem)), key=lambda k: abs(ordem[k].fim - c.fim))
    folga_ini = folga if i == 0 else min(folga, max(0.0, ordem[i].inicio - ordem[i - 1].fim) / 2)
    folga_fim = folga if j == len(ordem) - 1 else min(folga, max(0.0, ordem[j + 1].inicio - ordem[j].fim) / 2)
    novo = replace(c, inicio=max(0.0, ordem[i].inicio - folga_ini), fim=ordem[j].fim + folga_fim)
    d = novo.fim - novo.inicio
    if not DURACAO_MIN <= d <= DURACAO_MAX:
        raise ValueError(f"corte {c.id} ficou com {d:.1f} s depois do ajuste; o permitido é de 30 a 90 s")
    return novo


def _tempo_ass(t: float) -> str:
    cs = int(round(max(t, 0.0) * 100))
    h, cs = divmod(cs, 360000)
    m, cs = divmod(cs, 6000)
    s, cs = divmod(cs, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def legenda_ass(palavras: list[Palavra], inicio: float, fim: float, max_palavras: int = 4) -> str:
    dentro = [p for p in palavras if p.inicio >= inicio and p.fim <= fim]
    linhas = [(ESTILO / "legenda.ass.tpl").read_text(encoding="utf-8").rstrip("\n")]
    for i in range(0, len(dentro), max_palavras):
        bloco = dentro[i:i + max_palavras]
        texto = " ".join(p.texto for p in bloco).replace("{", "(").replace("}", ")")
        linhas.append(f"Dialogue: 0,{_tempo_ass(bloco[0].inicio - inicio)},"
                      f"{_tempo_ass(bloco[-1].fim - inicio)},Padrao,,0,0,0,,{texto}")
    return "\n".join(linhas) + "\n"


def enquadrar(trechos: list[Trecho], inicio: float, fim: float, enquadramento: dict[str, Recorte],
              escala: float = 0.5) -> list[tuple[float, float, Recorte]]:
    """Intervalos (relativos ao início do corte) com o recorte de quem fala.

    Os recortes do episodio.yaml estão em pixels da câmera A (4K); `escala`
    converte para a resolução do vídeo de onde se recorta.
    """
    padrao = next(iter(enquadramento.values()))
    saida: list[tuple[float, float, Recorte]] = []
    for t in trechos:
        a, b = max(t.inicio, inicio), min(t.fim, fim)
        if b <= a:
            continue
        r = enquadramento.get(t.falante, padrao)
        r = Recorte(round(r.x * escala), round(r.y * escala), round(r.w * escala), round(r.h * escala))
        if saida and saida[-1][2] == r:
            saida[-1] = (saida[-1][0], b - inicio, r)
        else:
            saida.append((a - inicio, b - inicio, r))
    return saida or [(0.0, fim - inicio, padrao)]


def _ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *args], check=True)


def _largura(video: Path) -> int:
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=width", "-of", "default=nw=1:nk=1", str(video)],
                       capture_output=True, text=True, check=True)
    return int(r.stdout.strip())


def renderizar(ep: Episodio, c: Corte, palavras: list[Palavra], trechos: list[Trecho],
               video_a: Path, audio: Path, saida: Path) -> Path:
    """Corte vertical recortado da câmera A (4K, sem as inserções da B).

    Tempos na linha do tempo da câmera A. O áudio vem do áudio final, cortado
    uma vez só (sem emendas que estalam). Escreve em arquivo parcial e renomeia.
    """
    escala = _largura(video_a) / LARGURA_REF_4K
    intervalos = enquadrar(trechos, c.inicio, c.fim, ep.enquadramento, escala)
    saida = Path(saida)
    parcial = saida.with_name(saida.stem + ".parcial" + saida.suffix)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        partes = []
        for i, (a, b, r) in enumerate(intervalos):
            parte = tmp / f"p{i:04d}.mp4"
            _ffmpeg("-ss", f"{c.inicio + a:.3f}", "-i", str(video_a), "-t", f"{b - a:.3f}", "-an",
                    "-vf", f"crop={r.w}:{r.h}:{r.x}:{r.y},scale={LARGURA}:{ALTURA},setsar=1,fps={FPS}",
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", str(parte))
            partes.append(parte)
        lista = tmp / "lista.txt"
        lista.write_text("".join(f"file '{p}'\n" for p in partes), encoding="utf-8")
        corpo = tmp / "corpo.mp4"
        _ffmpeg("-f", "concat", "-safe", "0", "-i", str(lista), "-c", "copy", str(corpo))
        ass = tmp / "legenda.ass"
        ass.write_text(legenda_ass(palavras, c.inicio, c.fim), encoding="utf-8")
        dur = c.fim - c.inicio
        _ffmpeg("-i", str(corpo), "-ss", f"{c.inicio:.3f}", "-t", f"{dur:.3f}", "-i", str(audio),
                "-loop", "1", "-t", f"{CARTELA_SEG}", "-i", str(ESTILO / "cartela.png"),
                "-f", "lavfi", "-t", f"{CARTELA_SEG}", "-i", "anullsrc=r=48000:cl=stereo",
                "-filter_complex",
                f"[0:v]ass={ass}[v0];[1:a]aresample=48000,aformat=channel_layouts=stereo[a0];"
                f"[2:v]scale={LARGURA}:{ALTURA},setsar=1,fps={FPS},format=yuv420p[v1];"
                f"[v0][a0][v1][3:a]concat=n=2:v=1:a=1[v][a]",
                "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", str(parcial))
    parcial.rename(saida)
    return saida
