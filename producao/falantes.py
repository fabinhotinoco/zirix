"""Quem fala em cada momento, a partir da energia de cada lapela.

Cada pessoa tem o próprio transmissor. Em cada quadro, fala quem tem energia
bem acima de todos os outros (margem relativa): a voz que vaza na lapela do
vizinho chega mais fraca e não vence. Abaixo de `piso_db` (dBFS) é silêncio:
o piso é absoluto porque um apresentador pode falar quase o tempo todo, e um
piso estimado pela própria faixa ficaria acima da voz dele. Quadros sem vencedor (silêncio, fala
sobreposta) ficam com o falante anterior, e trechos curtos demais (interjeições)
são absorvidos pelo vizinho.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np


@dataclass(frozen=True)
class Trecho:
    inicio: float
    fim: float
    falante: str


def _rms_db(sinal: np.ndarray, passo: int, n_quadros: int) -> np.ndarray:
    s = np.zeros(n_quadros * passo, dtype=np.float32)
    k = min(len(sinal), len(s))
    s[:k] = sinal[:k]
    rms = np.sqrt(np.mean(s.reshape(n_quadros, passo) ** 2, axis=1))
    return 20 * np.log10(rms + 1e-9)


def _vencedores(faixas: dict[str, np.ndarray], taxa: int, quadro: float, margem_db: float,
                piso_db: float) -> list[str | None]:
    nomes = list(faixas)
    passo = int(quadro * taxa)
    n_quadros = max(len(s) for s in faixas.values()) // passo
    db = np.vstack([_rms_db(faixas[n], passo, n_quadros) for n in nomes])
    resultado: list[str | None] = []
    for q in range(n_quadros):
        coluna = db[:, q]
        i = int(np.argmax(coluna))
        outros = np.delete(coluna, i)
        ok = coluna[i] > piso_db and (len(outros) == 0 or coluna[i] - outros.max() >= margem_db)
        resultado.append(nomes[i] if ok else None)
    return resultado


def _agrupar(rotulos: list[str], quadro: float) -> list[Trecho]:
    trechos: list[Trecho] = []
    for q, nome in enumerate(rotulos):
        ini, fim = q * quadro, (q + 1) * quadro
        if trechos and trechos[-1].falante == nome:
            trechos[-1] = Trecho(trechos[-1].inicio, fim, nome)
        else:
            trechos.append(Trecho(ini, fim, nome))
    return trechos


def _absorver_curtos(trechos: list[Trecho], minimo: float) -> list[Trecho]:
    mudou = True
    while mudou and len(trechos) > 1:
        mudou = False
        for i, t in enumerate(trechos):
            if t.fim - t.inicio >= minimo:
                continue
            if i > 0:
                anterior = trechos[i - 1]
                trechos[i - 1] = Trecho(anterior.inicio, t.fim, anterior.falante)
            else:
                proximo = trechos[1]
                trechos[1] = Trecho(t.inicio, proximo.fim, proximo.falante)
            del trechos[i]
            trechos = _agrupar_trechos(trechos)
            mudou = True
            break
    return trechos


def _agrupar_trechos(trechos: list[Trecho]) -> list[Trecho]:
    saida: list[Trecho] = []
    for t in trechos:
        if saida and saida[-1].falante == t.falante:
            saida[-1] = Trecho(saida[-1].inicio, t.fim, t.falante)
        else:
            saida.append(t)
    return saida


def linha_do_tempo(faixas: dict[str, np.ndarray], taxa: int, quadro: float = 0.5,
                   margem_db: float = 6.0, minimo: float = 1.5, piso_db: float = -50.0) -> list[Trecho]:
    """Faixas já alinhadas à câmera A. Devolve trechos contínuos, sem buracos."""
    vencedores = _vencedores(faixas, taxa, quadro, margem_db, piso_db)
    primeiro = next((v for v in vencedores if v is not None), next(iter(faixas)))
    rotulos, atual = [], primeiro
    for v in vencedores:
        atual = v if v is not None else atual
        rotulos.append(atual)
    return _absorver_curtos(_agrupar(rotulos, quadro), minimo)


def salvar(trechos: list[Trecho], caminho: Path) -> None:
    Path(caminho).write_text(json.dumps([asdict(t) for t in trechos], ensure_ascii=False, indent=1),
                             encoding="utf-8")


def carregar(caminho: Path) -> list[Trecho]:
    return [Trecho(**d) for d in json.loads(Path(caminho).read_text(encoding="utf-8"))]
