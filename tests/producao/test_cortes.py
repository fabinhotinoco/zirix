import pytest

from apoio import ffprobe_resolucao, gerar_video
from producao.cortes import (Corte, aprovada, ajustar_bordas, enquadrar, ler_lista, legenda_ass,
                             renderizar)
from producao.episodio import Episodio, Falante, Recorte
from producao.falantes import Trecho
from producao.midia import duracao
from producao.transcricao import Palavra


def _lista(tmp_path, cortes, aprovado=True):
    linhas = [f"aprovado: {'true' if aprovado else 'false'}", "cortes:"]
    for cid, ini, fim in cortes:
        linhas.append(f"  - {{id: {cid}, inicio: {ini}, fim: {fim}, titulo: 'T {cid}'}}")
    caminho = tmp_path / "cortes.yaml"
    caminho.write_text("\n".join(linhas) + "\n", encoding="utf-8")
    return caminho


def test_ajusta_para_borda_de_palavra():
    p = [Palavra(10.0, 10.4, "a"), Palavra(10.5, 11.0, "frota"), Palavra(49.6, 50.2, "fim")]
    c = ajustar_bordas(Corte("c1", 10.45, 49.9, "x"), p)
    assert c.inicio == pytest.approx(10.35) and c.fim == pytest.approx(50.35)


def test_lista_valida(tmp_path):
    cortes = ler_lista(_lista(tmp_path, [("c1", 0, 40), ("c2", 100, 160), ("c3", 200, 245), ("c4", 300, 390)]))
    assert [c.id for c in cortes] == ["c1", "c2", "c3", "c4"]


def test_lista_recusa_corte_fora_de_30_a_90(tmp_path):
    with pytest.raises(ValueError, match="c2.*95"):
        ler_lista(_lista(tmp_path, [("c1", 0, 40), ("c2", 100, 195), ("c3", 200, 245), ("c4", 300, 340)]))


def test_lista_recusa_quantidade_errada(tmp_path):
    with pytest.raises(ValueError, match="4 a 6"):
        ler_lista(_lista(tmp_path, [("c1", 0, 40), ("c2", 100, 140), ("c3", 200, 245)]))


def test_aprovada(tmp_path):
    assert aprovada(_lista(tmp_path, [("c1", 0, 40)], aprovado=True))
    assert not aprovada(_lista(tmp_path, [("c1", 0, 40)], aprovado=False))


def test_legenda_ass_blocos_e_tempos_relativos():
    palavras = [Palavra(100 + i * 0.5, 100 + i * 0.5 + 0.4, f"p{i}") for i in range(8)]
    ass = legenda_ass(palavras, inicio=100.0, fim=104.0)
    assert ass.count("Dialogue:") == 2
    assert "0:00:00.00" in ass and "p0 p1 p2 p3" in ass


def test_legenda_ignora_palavras_fora_do_corte():
    palavras = [Palavra(10, 10.4, "fora"), Palavra(100.1, 100.4, "dentro")]
    ass = legenda_ass(palavras, inicio=100.0, fim=104.0)
    assert "dentro" in ass and "fora" not in ass


def test_enquadra_quem_fala():
    quadros = {"fabio": Recorte(300, 0, 1216, 2160), "saulo": Recorte(1312, 0, 1216, 2160)}
    r = enquadrar([Trecho(0, 20, "fabio"), Trecho(20, 40, "saulo")], 10, 30, quadros, escala=0.5)
    assert [(a, b) for a, b, _ in r] == [(0, 10), (10, 20)]
    assert [x[2] for x in r] == [Recorte(150, 0, 608, 1080), Recorte(656, 0, 608, 1080)]


def test_renderiza_vertical_com_cartela(tmp_path):
    video = gerar_video(tmp_path / "ep.mp4", segundos=10, largura=1920, altura=1080)
    ep = Episodio("EP99", "t", tmp_path, video, None,
                  {"fabio": Falante("fabio", tmp_path / "f.wav", "Fabio")},
                  {"fabio": Recorte(1000, 0, 1216, 2160)})
    palavras = [Palavra(0.2, 0.6, "Olá"), Palavra(0.7, 1.2, "frota")]
    saida = renderizar(ep, Corte("c1", 0, 6, "x"), palavras, [Trecho(0, 10, "fabio")], video,
                       tmp_path / "c1.mp4")
    assert ffprobe_resolucao(saida) == (1080, 1920)
    assert duracao(saida) == pytest.approx(9.0, abs=0.15)
