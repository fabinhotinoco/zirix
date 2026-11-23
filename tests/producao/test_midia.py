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


def test_aplicar_alinhamento_corrige_deriva_pequena(tmp_path):
    from producao.midia import aplicar_alinhamento, gravar_wav
    from producao.sincronia import alinhar
    from test_sincronia import fala_sintetica
    taxa = 16000
    ref = fala_sintetica(600)
    fator = 1.00001                       # 10 ppm: abaixo do passo de 1 Hz do asetrate
    t = np.arange(int(len(ref) / fator)) * fator
    outro = np.interp(t, np.arange(len(ref)), ref).astype(np.float32)
    al = alinhar(ref, outro, taxa)
    src = gravar_wav(tmp_path / "tx.wav", outro, taxa)
    saida = aplicar_alinhamento(src, tmp_path / "al.wav", al.atraso, al.deriva, len(ref) / taxa, taxa=taxa)
    corrigido, _ = ler_wav(saida)
    assert abs(alinhar(ref, corrigido, taxa).deriva) < 3e-6


def test_aplicar_alinhamento_preserva_pico_acima_de_0dbfs(tmp_path):
    from producao.midia import aplicar_alinhamento
    sinal = np.zeros(48000, np.float32)
    sinal[24000] = 1.5                    # pico de 32-bit float acima de 0 dBFS
    src = gravar_float32(tmp_path / "tx.wav", sinal, 48000)
    saida, _ = ler_wav(aplicar_alinhamento(src, tmp_path / "al.wav", 0.0, 0.0, 1.0))
    assert float(np.abs(saida).max()) > 1.2


def test_normalizar_cfr_recusa_hdr(tmp_path):
    import pytest
    from apoio import rodar
    hdr = tmp_path / "hdr.mp4"
    rodar("ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=30:duration=1",
          "-c:v", "libx264", "-pix_fmt", "yuv420p", "-color_primaries", "bt2020", "-color_trc", "arib-std-b67",
          "-colorspace", "bt2020nc", str(hdr))
    with pytest.raises(ValueError, match="HDR"):
        normalizar_cfr(hdr, tmp_path / "cfr.mp4")
