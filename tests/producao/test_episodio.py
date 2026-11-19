import pytest

from producao.episodio import Recorte, carregar

YAML_OK = """
codigo: EP99
titulo: Teste
camera_a: camera_a.mov
falantes:
  fabio: {arquivo: tx1.wav, nome: "Fabio Tinoco"}
  saulo: {arquivo: tx2.wav, nome: "Saulo"}
enquadramento:
  fabio: {x: 300, y: 0, w: 1215, h: 2160}
  saulo: {x: 1312, y: 0, w: 1215, h: 2160}
"""

YAML_RUIM = """
codigo: EP98
titulo: Teste
camera_a: camera_a.mov
falantes:
  fabio: {arquivo: tx1.wav, nome: "Fabio Tinoco"}
enquadramento:
  joao: {x: 0, y: 0, w: 10, h: 10}
"""


def escrever(raiz, codigo, texto):
    pasta = raiz / "episodios" / codigo
    pasta.mkdir(parents=True)
    (pasta / "episodio.yaml").write_text(texto, encoding="utf-8")


def test_carregar_resolve_caminhos(tmp_path):
    escrever(tmp_path, "EP99", YAML_OK)
    ep = carregar("EP99", raiz=tmp_path)
    assert ep.camera_a == tmp_path / "trabalho/EP99/camera_a.mov"
    assert set(ep.falantes) == {"fabio", "saulo"}
    assert ep.falantes["fabio"].arquivo == tmp_path / "trabalho/EP99/tx1.wav"
    assert ep.enquadramento["saulo"] == Recorte(1312, 0, 1215, 2160)
    assert ep.camera_b is None


def test_carregar_recusa_enquadramento_de_falante_inexistente(tmp_path):
    escrever(tmp_path, "EP98", YAML_RUIM)
    with pytest.raises(ValueError, match="enquadramento.*joao"):
        carregar("EP98", raiz=tmp_path)
