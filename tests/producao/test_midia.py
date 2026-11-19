import numpy as np

from apoio import ffprobe_campo, gerar_video, gravar_float32
from producao.midia import (duracao, extrair_audio, ler_wav, medir_lufs,
                            normalizar_cfr, normalizar_loudness)


def test_ler_wav_float32(tmp_path):
    caminho = gravar_float32(tmp_path / "tx.wav", np.full(48000, 0.5, np.float32), 48000)
    sinal, taxa = ler_wav(caminho)
    assert taxa == 48000 and sinal.dtype == np.float32
    assert abs(float(sinal.mean()) - 0.5) < 1e-4


def test_extrair_audio_mono_16k(video_sintetico, tmp_path):
    sinal, taxa = ler_wav(extrair_audio(video_sintetico, tmp_path / "a.wav"))
    assert taxa == 16000 and sinal.ndim == 1
    assert abs(len(sinal) / taxa - 10.0) < 0.1


def test_normaliza_cfr(tmp_path):
    vfr = gerar_video(tmp_path / "vfr.mp4", vfr=True)
    saida = normalizar_cfr(vfr, tmp_path / "cfr.mp4")
    assert ffprobe_campo(saida, "r_frame_rate") == "30/1"
    assert ffprobe_campo(saida, "avg_frame_rate") == "30/1"
    assert abs(duracao(saida) - duracao(vfr)) < 0.2


def test_normalizar_loudness_chega_a_menos_16(video_sintetico, tmp_path):
    wav = extrair_audio(video_sintetico, tmp_path / "a.wav", taxa=48000)
    normalizado = normalizar_loudness(wav, tmp_path / "n.wav")
    assert abs(medir_lufs(normalizado) - (-16.0)) <= 1.0
