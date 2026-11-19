import numpy as np
import pytest

from producao.sincronia import Alinhamento, alinhar, estimar_atraso, tempo_em_outro

TAXA = 16000
rng = np.random.default_rng(7)


def fala_sintetica(segundos: float) -> np.ndarray:
    """Ruído modulado por um envelope irregular, parecido com fala."""
    n = int(segundos * TAXA)
    envelope = np.repeat(rng.uniform(0, 1, size=n // 1600 + 1), 1600)[:n] ** 2
    return (rng.normal(size=n) * envelope).astype(np.float32)


def test_atraso_conhecido():
    ref = fala_sintetica(30)
    outro = ref[int(2.35 * TAXA):]
    assert estimar_atraso(ref, outro, TAXA) == pytest.approx(2.35, abs=0.01)


def test_offset_com_inicio_atrasado():
    ref = fala_sintetica(200)
    b = ref[40 * TAXA: 180 * TAXA] + 0.01 * rng.normal(size=140 * TAXA).astype(np.float32)
    assert estimar_atraso(ref, b, TAXA) == pytest.approx(40.0, abs=0.02)


def test_ganhos_diferentes_nao_atrapalham():
    ref = fala_sintetica(30)
    outro = 0.05 * ref[int(2.35 * TAXA):]
    assert estimar_atraso(ref, outro, TAXA) == pytest.approx(2.35, abs=0.01)


def test_deriva_linear():
    ref = fala_sintetica(600)
    fator = 1.00002          # relógio do outro aparelho 20 ppm mais lento
    t = np.arange(int(len(ref) / fator)) * fator
    outro = np.interp(t, np.arange(len(ref)), ref).astype(np.float32)
    al = alinhar(ref, outro, TAXA)
    assert al.deriva == pytest.approx(2e-5, abs=5e-6)
    assert abs(al.atraso) < 0.01


def test_tempo_em_outro():
    al = Alinhamento(atraso=2.0, deriva=1e-4)
    assert tempo_em_outro(100.0, al) == pytest.approx(100.0 - 2.0 - 0.01)


def test_gravacao_curta_sem_deriva():
    ref = fala_sintetica(60)
    assert alinhar(ref, ref[TAXA:], TAXA).deriva == 0.0
