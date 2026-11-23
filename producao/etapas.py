"""Etapas do fluxo de um episódio. Cada uma grava em trabalho/EPxx/ e é retomável."""
from __future__ import annotations

import json
from dataclasses import asdict, replace
from pathlib import Path

from producao import cortes as mod_cortes
from producao import falantes as mod_falantes
from producao import midia, montagem, sincronia, transcricao
from producao.episodio import Episodio


def _feito(*arquivos: Path) -> bool:
    return all(a.exists() for a in arquivos)


def _json(caminho: Path, dados) -> None:
    caminho.write_text(json.dumps(dados, ensure_ascii=False, indent=1), encoding="utf-8")


def _parcial(destino: Path) -> Path:
    return destino.with_name(destino.stem + ".parcial" + destino.suffix)


def _cfr(src: Path, destino: Path) -> Path:
    """Conversão para fps constante, feita uma vez só (é a etapa mais lenta)."""
    if destino.exists():
        return destino
    midia.normalizar_cfr(src, _parcial(destino))
    _parcial(destino).rename(destino)
    return destino


def preparar(ep: Episodio, refazer: bool = False) -> None:
    p = ep.pasta
    saidas = [p / "alinhamento.json", p / "falantes.json", p / "audio_final.wav"]
    if _feito(*saidas) and not refazer:
        print("preparar: já feito (use --refazer para refazer)")
        return
    a_cfr = _cfr(ep.camera_a, p / "a_cfr.mp4")
    ref, taxa = midia.ler_wav(midia.extrair_audio(a_cfr, p / "a_16k.wav"))
    dur_ref = midia.duracao(a_cfr)
    alinhamento: dict[str, dict] = {}

    if ep.camera_b is not None:
        b_cfr = _cfr(ep.camera_b, p / "b_cfr.mp4")
        b, _ = midia.ler_wav(midia.extrair_audio(b_cfr, p / "b_16k.wav"))
        al_b = sincronia.alinhar(ref, b, taxa)
        alinhamento["camera_b"] = {**asdict(al_b), "duracao": midia.duracao(b_cfr)}

    alinhadas_48k, alinhadas_16k = {}, {}
    for fid, f in ep.falantes.items():
        tx, _ = midia.ler_wav(midia.extrair_audio(f.arquivo, p / f"{fid}_16k.wav"))
        al = sincronia.alinhar(ref, tx, taxa)
        alinhamento[fid] = asdict(al)
        alinhadas_48k[fid] = midia.aplicar_alinhamento(f.arquivo, p / f"{fid}_alinhado.wav",
                                                       al.atraso, al.deriva, dur_ref)
        alinhadas_16k[fid], _ = midia.ler_wav(midia.extrair_audio(alinhadas_48k[fid], p / f"{fid}_alinhado_16k.wav"))

    trechos = mod_falantes.linha_do_tempo(alinhadas_16k, taxa)
    mod_falantes.salvar(trechos, p / "falantes.json")
    montagem.mixar_lapelas(alinhadas_48k, p / "audio_final.wav")
    _json(p / "alinhamento.json", alinhamento)
    print(f"preparar: {len(trechos)} trechos de fala; alinhamento em {p / 'alinhamento.json'}")


def transcrever(ep: Episodio, refazer: bool = False) -> None:
    p = ep.pasta
    if _feito(p / "palavras.json", p / "transcricao.txt") and not refazer:
        print("transcrever: já feito (use --refazer para refazer)")
        return
    palavras = transcricao.transcrever(p / "audio_final.wav")
    transcricao.salvar(palavras, p / "palavras.json")
    nomes = {fid: f.nome for fid, f in ep.falantes.items()}
    texto = transcricao.texto_com_tempos(palavras, mod_falantes.carregar(p / "falantes.json"), nomes)
    (p / "transcricao.txt").write_text(texto + "\n", encoding="utf-8")
    print(f"transcrever: {len(palavras)} palavras em {p / 'transcricao.txt'}")


def montar(ep: Episodio, inicio: float, fim: float, refazer: bool = False) -> None:
    p = ep.pasta
    if _feito(p / "episodio.mp4") and not refazer:
        print("montar: já feito (use --refazer para refazer)")
        return
    alinhamento = json.loads((p / "alinhamento.json").read_text(encoding="utf-8"))
    trechos = mod_falantes.carregar(p / "falantes.json")
    duracao = midia.duracao(p / "audio_final.wav")
    al_b, cobertura = None, None
    ep_cfr = replace(ep, camera_a=p / "a_cfr.mp4",
                     camera_b=p / "b_cfr.mp4" if "camera_b" in alinhamento else None)
    if "camera_b" in alinhamento:
        b = alinhamento["camera_b"]
        al_b = sincronia.Alinhamento(b["atraso"], b["deriva"])
        cobertura = (max(0.0, al_b.atraso), al_b.atraso + b["duracao"] / (1 - al_b.deriva))
    planos = montagem.decidir_planos(trechos, duracao, cobertura)
    _json(p / "planos.json", [asdict(x) for x in planos])
    _json(p / "montagem.json", {"inicio": inicio, "fim": fim})
    montagem.renderizar(ep_cfr, planos, al_b, p / "audio_final.wav", _parcial(p / "episodio.mp4"), inicio, fim)
    _parcial(p / "episodio.mp4").rename(p / "episodio.mp4")
    print(f"montar: {p / 'episodio.mp4'} pronto para revisão (parada 2)")


def cortar(ep: Episodio, raiz: Path, refazer: bool = False) -> None:
    p = ep.pasta
    lista = Path(raiz) / "episodios" / ep.codigo / "cortes.yaml"
    if not lista.exists() or not mod_cortes.aprovada(lista):
        raise SystemExit(f"cortar: {lista} precisa existir e estar aprovado (aprovado: true)")
    cortes = mod_cortes.ler_lista(lista)
    palavras = transcricao.carregar(p / "palavras.json")
    trechos = mod_falantes.carregar(p / "falantes.json")
    (p / "cortes").mkdir(exist_ok=True)
    for c in cortes:
        saida = p / "cortes" / f"{c.id}.mp4"
        if saida.exists() and not refazer:
            continue
        c = mod_cortes.ajustar_bordas(c, palavras)
        mod_cortes.renderizar(ep, c, palavras, trechos, p / "a_cfr.mp4", p / "audio_final.wav", saida)
        print(f"cortar: {saida}")
