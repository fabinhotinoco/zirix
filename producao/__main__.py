"""python -m producao <comando> EPxx

  baixar EPxx                      baixa os arquivos listados em fontes: do yaml
  preparar EPxx                    fps constante, sincronia, quem fala e áudio final
  transcrever EPxx                 transcrição e texto por falante
  montar EPxx --inicio S --fim S   episódio horizontal para revisão (parada 2)
  cortar EPxx                      cortes verticais (exige cortes.yaml aprovado, parada 1)
"""
from __future__ import annotations

import argparse
from pathlib import Path

from producao import etapas, ingestao
from producao.episodio import carregar


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(prog="python -m producao", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raiz", type=Path, default=Path("."), help="raiz com episodios/ e trabalho/")
    sub = ap.add_subparsers(dest="comando", required=True)
    for nome in ("baixar", "preparar", "transcrever", "montar", "cortar"):
        s = sub.add_parser(nome)
        s.add_argument("codigo")
        s.add_argument("--refazer", action="store_true")
        if nome == "montar":
            s.add_argument("--inicio", type=float, required=True)
            s.add_argument("--fim", type=float, required=True)
    a = ap.parse_args(argv)
    ep = carregar(a.codigo, raiz=a.raiz)

    if a.comando == "baixar":
        for arq in ingestao.baixar(ep, refazer=a.refazer):
            print(f"baixar: {arq}")
    elif a.comando == "preparar":
        etapas.preparar(ep, a.refazer)
    elif a.comando == "transcrever":
        etapas.transcrever(ep, a.refazer)
    elif a.comando == "montar":
        etapas.montar(ep, a.inicio, a.fim, a.refazer)
    elif a.comando == "cortar":
        etapas.cortar(ep, a.raiz, a.refazer)


if __name__ == "__main__":
    main()
