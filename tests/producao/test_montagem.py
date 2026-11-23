from pathlib import Path

import numpy as np
import pytest

from apoio import ffprobe_resolucao, gerar_video, gravar_pcm16
from producao.episodio import Episodio
from producao.falantes import Trecho
from producao.midia import duracao, extrair_audio, medir_lufs
from producao.montagem import Plano, decidir_planos, mixar_lapelas, renderizar

TRECHOS = [Trecho(0, 30, "fabio"), Trecho(30, 60, "saulo"), Trecho(60, 200, "fabio"),
           Trecho(200, 600, "saulo")]


def test_insere_b_apos_troca_de_falante():
    p = decidir_planos([Trecho(0, 30, "fabio"), Trecho(30, 60, "saulo")], 60, (0, 60))
    assert Plano(30, 36, "B") in p


def test_insere_b_em_fala_longa():
    p = decidir_planos([Trecho(0, 100, "fabio")], 100, (0, 100))
    assert Plano(25, 31, "B") in p and Plano(50, 56, "B") in p


def test_sem_b_usa_so_a():
    assert {x.camera for x in decidir_planos(TRECHOS, 600, None)} == {"A"}


def test_b_so_dentro_da_cobertura():
    p = decidir_planos(TRECHOS, 600, (100, 300))
    assert any(x.camera == "B" for x in p)
    assert all(100 <= x.inicio and x.fim <= 300 for x in p if x.camera == "B")


def test_planos_cobrem_tudo_sem_buraco():
    p = decidir_planos(TRECHOS, 600, (0, 600))
    assert p[0].inicio == 0 and p[-1].fim == 600
    assert all(a.fim == b.inicio for a, b in zip(p, p[1:]))
    assert all(x.fim > x.inicio for x in p)


def test_a_minimo_entre_insercoes():
    p = decidir_planos(TRECHOS, 600, (0, 600), min_a=8.0)
    assert all(x.fim - x.inicio >= 8.0 for x in p[1:-1] if x.camera == "A")


@pytest.fixture
def ep_sintetico(tmp_path):
    a = gerar_video(tmp_path / "a.mp4", segundos=10)
    b = gerar_video(tmp_path / "b.mp4", segundos=10, largura=640, altura=360, freq=660)
    return Episodio("EP99", "t", tmp_path, a, b, {}, {})


def test_renderiza_1080p30_com_duracao_certa(ep_sintetico, tmp_path):
    audio = extrair_audio(ep_sintetico.camera_a, tmp_path / "audio.wav", taxa=48000)
    planos = [Plano(0, 4, "A"), Plano(4, 6, "B"), Plano(6, 10, "A")]
    saida = renderizar(ep_sintetico, planos, None, audio, tmp_path / "ep.mp4", 1.0, 9.0)
    assert ffprobe_resolucao(saida) == (1920, 1080)
    assert duracao(saida) == pytest.approx(8.0, abs=0.1)


def test_mixar_lapelas_normaliza(tmp_path):
    t = np.arange(48000 * 5) / 48000
    f = gravar_pcm16(tmp_path / "f.wav", 0.05 * np.sin(2 * np.pi * 200 * t), 48000)
    s = gravar_pcm16(tmp_path / "s.wav", 0.05 * np.sin(2 * np.pi * 300 * t), 48000)
    saida = mixar_lapelas({"fabio": f, "saulo": s}, tmp_path / "mix.wav")
    assert medir_lufs(saida) == pytest.approx(-16.0, abs=1.0)
