import numpy as np

from producao.falantes import Trecho, carregar, linha_do_tempo, salvar

TAXA = 16000
rng = np.random.default_rng(3)


def voz(segundos: float) -> np.ndarray:
    t = np.arange(int(segundos * TAXA)) / TAXA
    return (0.3 * np.sin(2 * np.pi * 180 * t) * (0.6 + 0.4 * np.sin(2 * np.pi * 3 * t))).astype(np.float32)


def silencio(segundos: float) -> np.ndarray:
    return (0.001 * rng.normal(size=int(segundos * TAXA))).astype(np.float32)


def resumo(trechos):
    return [(x.falante, round(x.inicio), round(x.fim)) for x in trechos]


def test_alternancia_simples():
    fabio = np.concatenate([voz(10), silencio(10)])
    saulo = np.concatenate([silencio(10), voz(10)])
    assert resumo(linha_do_tempo({"fabio": fabio, "saulo": saulo}, TAXA)) == [
        ("fabio", 0, 10), ("saulo", 10, 20)]


def test_vazamento_nao_vira_fala():
    fala = np.concatenate([voz(20), silencio(5), voz(15)])
    t = linha_do_tempo({"fabio": 0.25 * fala + silencio(40), "saulo": fala + silencio(40)}, TAXA)
    assert {x.falante for x in t} == {"saulo"}


def test_interjeicao_curta_e_absorvida():
    fabio = np.concatenate([voz(10), silencio(0.6), voz(10)])
    saulo = np.concatenate([silencio(10), voz(0.6), silencio(10)])
    assert [x.falante for x in linha_do_tempo({"fabio": fabio, "saulo": saulo}, TAXA)] == ["fabio"]


def test_trechos_cobrem_toda_a_duracao():
    fabio = np.concatenate([silencio(3), voz(10), silencio(7)])
    saulo = np.concatenate([silencio(13), voz(7)])
    t = linha_do_tempo({"fabio": fabio, "saulo": saulo}, TAXA)
    assert t[0].inicio == 0 and abs(t[-1].fim - 20) < 0.5
    assert all(a.fim == b.inicio for a, b in zip(t, t[1:]))


def test_salvar_e_carregar(tmp_path):
    t = [Trecho(0.0, 5.0, "fabio"), Trecho(5.0, 9.5, "saulo")]
    salvar(t, tmp_path / "f.json")
    assert carregar(tmp_path / "f.json") == t
