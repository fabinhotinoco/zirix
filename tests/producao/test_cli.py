import json

import pytest

from apoio import ffprobe_resolucao, montar_episodio_sintetico, rodar_cli
from producao.midia import duracao, medir_lufs

CORTES = """aprovado: {aprovado}
cortes:
  - {{id: c1, inicio: 1, fim: 31, titulo: 'Um'}}
  - {{id: c2, inicio: 5, fim: 35, titulo: 'Dois'}}
  - {{id: c3, inicio: 8, fim: 38, titulo: 'Tres'}}
  - {{id: c4, inicio: 3, fim: 33, titulo: 'Quatro'}}
"""


def _ok(r):
    assert r.returncode == 0, r.stderr


def test_cortar_exige_aprovacao(tmp_path):
    montar_episodio_sintetico(tmp_path, com_b=False)
    (tmp_path / "episodios/EP99/cortes.yaml").write_text(CORTES.format(aprovado="false"))
    r = rodar_cli(["cortar", "EP99"], raiz=tmp_path)
    assert r.returncode != 0 and "aprovad" in r.stderr


def test_preparar_sincroniza_e_e_retomavel(tmp_path):
    montar_episodio_sintetico(tmp_path)
    _ok(rodar_cli(["preparar", "EP99"], raiz=tmp_path))
    pasta = tmp_path / "trabalho/EP99"
    al = json.loads((pasta / "alinhamento.json").read_text())
    assert al["camera_b"]["atraso"] == pytest.approx(2.0, abs=0.05)
    assert al["fabio"]["atraso"] == pytest.approx(1.0, abs=0.05)
    falantes = json.loads((pasta / "falantes.json").read_text())
    assert [f["falante"] for f in falantes] == ["fabio", "saulo"]
    assert falantes[1]["inicio"] == pytest.approx(20.0, abs=0.6)
    assert medir_lufs(pasta / "audio_final.wav") == pytest.approx(-16.0, abs=1.0)
    mtime = (pasta / "falantes.json").stat().st_mtime
    _ok(rodar_cli(["preparar", "EP99"], raiz=tmp_path))
    assert (pasta / "falantes.json").stat().st_mtime == mtime


def test_ponta_a_ponta_sintetico(tmp_path):
    montar_episodio_sintetico(tmp_path)
    pasta = tmp_path / "trabalho/EP99"
    _ok(rodar_cli(["preparar", "EP99"], raiz=tmp_path))
    (pasta / "palavras.json").write_text("[]")  # transcrição real fica no teste lento da Task 4
    _ok(rodar_cli(["montar", "EP99", "--inicio", "0.5", "--fim", "39.5"], raiz=tmp_path))
    assert ffprobe_resolucao(pasta / "episodio.mp4") == (1920, 1080)
    assert duracao(pasta / "episodio.mp4") == pytest.approx(39.0, abs=0.2)
    (tmp_path / "episodios/EP99/cortes.yaml").write_text(CORTES.format(aprovado="true"))
    _ok(rodar_cli(["cortar", "EP99"], raiz=tmp_path))
    for c in ("c1", "c2", "c3", "c4"):
        saida = pasta / "cortes" / f"{c}.mp4"
        assert ffprobe_resolucao(saida) == (1080, 1920)
        assert duracao(saida) == pytest.approx(33.0, abs=0.5)


def test_cortes_nao_dependem_do_episodio_montado(tmp_path):
    """Os cortes saem da câmera A em 4K (sem inserções da B), não do episodio.mp4."""
    montar_episodio_sintetico(tmp_path)
    pasta = tmp_path / "trabalho/EP99"
    _ok(rodar_cli(["preparar", "EP99"], raiz=tmp_path))
    (pasta / "palavras.json").write_text("[]")
    (tmp_path / "episodios/EP99/cortes.yaml").write_text(CORTES.format(aprovado="true"))
    _ok(rodar_cli(["cortar", "EP99"], raiz=tmp_path))
    assert (pasta / "cortes/c1.mp4").exists() and not (pasta / "episodio.mp4").exists()


def test_montar_interrompido_nao_deixa_arquivo_final(tmp_path, monkeypatch):
    from producao import etapas, montagem
    from producao.episodio import carregar
    montar_episodio_sintetico(tmp_path, com_b=False)
    _ok(rodar_cli(["preparar", "EP99"], raiz=tmp_path))

    def falha(ep, planos, al_b, audio, saida, ini, fim):
        saida.write_bytes(b"parcial")
        raise RuntimeError("interrompido")
    monkeypatch.setattr(montagem, "renderizar", falha)
    with pytest.raises(RuntimeError):
        etapas.montar(carregar("EP99", raiz=tmp_path), 0.5, 39.5)
    assert not (tmp_path / "trabalho/EP99/episodio.mp4").exists()
