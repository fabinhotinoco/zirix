"""Download dos arquivos de um episódio a partir de links do Google Drive.

Os arquivos são compartilhados por link ("qualquer pessoa com o link") só
enquanto são baixados; depois o compartilhamento pode ser desfeito.
"""
from __future__ import annotations

import re
import shutil
import urllib.request
from pathlib import Path

from producao.episodio import Episodio

_ID = r"([A-Za-z0-9_-]{5,})"


def url_download(link: str) -> str:
    m = (re.match(rf"https://drive\.google\.com/file/d/{_ID}", link)
         or re.match(rf"https://drive\.google\.com/(?:open|uc)\?(?:.*&)?id={_ID}", link))
    if not m:
        raise ValueError(f"link não reconhecido como arquivo do Google Drive: {link}")
    return f"https://drive.usercontent.google.com/download?id={m.group(1)}&export=download&confirm=t"


def destinos(ep: Episodio) -> dict[str, Path]:
    """Chave de `fontes:` no yaml -> arquivo local (camera_a, camera_b ou id do falante)."""
    mapa: dict[str, Path] = {"camera_a": ep.camera_a}
    if ep.camera_b is not None:
        mapa["camera_b"] = ep.camera_b
    mapa.update({fid: f.arquivo for fid, f in ep.falantes.items()})
    return mapa


def baixar(ep: Episodio, refazer: bool = False) -> list[Path]:
    ep.pasta.mkdir(parents=True, exist_ok=True)
    mapa, baixados = destinos(ep), []
    for chave, link in ep.fontes.items():
        if chave not in mapa:
            raise ValueError(f"fontes.{chave} não corresponde a camera_a, camera_b nem a um falante")
        alvo = mapa[chave]
        if alvo.exists() and not refazer:
            continue
        parcial = alvo.with_suffix(alvo.suffix + ".parcial")
        with urllib.request.urlopen(url_download(link)) as resp, open(parcial, "wb") as out:
            if "text/html" in resp.headers.get("Content-Type", ""):
                raise RuntimeError(f"{chave}: o Drive devolveu uma página, não o arquivo. "
                                   "Confira se o link está compartilhado com 'qualquer pessoa com o link'.")
            shutil.copyfileobj(resp, out, length=8 * 1024 * 1024)
        parcial.rename(alvo)
        baixados.append(alvo)
    return baixados
