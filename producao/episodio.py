"""Configuração de um episódio (episodios/EPxx/episodio.yaml).

Os arquivos de mídia citados no yaml são relativos a trabalho/EPxx/, que fica
fora do git.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml


@dataclass(frozen=True)
class Recorte:
    """Retângulo em pixels da câmera A (4K)."""
    x: int
    y: int
    w: int
    h: int


@dataclass(frozen=True)
class Falante:
    id: str
    arquivo: Path
    nome: str
    cargo: str | None = None


@dataclass
class Episodio:
    codigo: str
    titulo: str
    pasta: Path
    camera_a: Path
    camera_b: Path | None
    falantes: dict[str, Falante]
    enquadramento: dict[str, Recorte] = field(default_factory=dict)
    fontes: dict[str, str] = field(default_factory=dict)


def carregar(codigo: str, raiz: Path = Path(".")) -> Episodio:
    raiz = Path(raiz)
    arquivo = raiz / "episodios" / codigo / "episodio.yaml"
    dados = yaml.safe_load(arquivo.read_text(encoding="utf-8")) or {}
    pasta = raiz / "trabalho" / codigo

    for chave in ("camera_a", "falantes"):
        if not dados.get(chave):
            raise ValueError(f"{arquivo}: campo obrigatório ausente: {chave}")

    falantes = {
        fid: Falante(fid, pasta / f["arquivo"], f.get("nome", fid), f.get("cargo"))
        for fid, f in dados["falantes"].items()
    }
    enquadramento = {}
    for fid, r in (dados.get("enquadramento") or {}).items():
        if fid not in falantes:
            raise ValueError(f"{arquivo}: enquadramento de falante inexistente: {fid}")
        enquadramento[fid] = Recorte(int(r["x"]), int(r["y"]), int(r["w"]), int(r["h"]))

    return Episodio(
        codigo=dados.get("codigo", codigo),
        titulo=dados.get("titulo", ""),
        pasta=pasta,
        camera_a=pasta / dados["camera_a"],
        camera_b=pasta / dados["camera_b"] if dados.get("camera_b") else None,
        falantes=falantes,
        enquadramento=enquadramento,
        fontes=dict(dados.get("fontes") or {}),
    )
