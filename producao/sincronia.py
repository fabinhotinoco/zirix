"""Sincronia entre fontes de áudio gravadas em aparelhos diferentes.

O atraso é medido por correlação cruzada do envelope de amplitude (não da forma
de onda), porque microfones diferentes captam a mesma voz com fase e timbre
diferentes. A deriva é a diferença de relógio entre os aparelhos: medimos o
atraso numa janela no início e noutra no fim e interpolamos linearmente.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

TAXA_ENVELOPE = 1000  # Hz: resolução de 1 ms, refinada por interpolação do pico


@dataclass(frozen=True)
class Alinhamento:
    atraso: float  # s: quanto o outro começou depois da referência
    deriva: float  # s de atraso a mais por s de gravação


def _envelope(sinal: np.ndarray, taxa: int) -> np.ndarray:
    passo = max(1, taxa // TAXA_ENVELOPE)
    n = len(sinal) // passo * passo
    env = np.abs(sinal[:n]).reshape(-1, passo).mean(axis=1)
    janela = np.ones(10) / 10  # 10 ms
    env = np.convolve(env, janela, mode="same")
    env = env - env.mean()
    norma = np.linalg.norm(env)
    return env / norma if norma > 0 else env


def _lag_no_pico(ref_env: np.ndarray, outro_env: np.ndarray, max_lag: int) -> float:
    """Lag (em amostras do envelope) que maximiza sum ref[n + lag] * outro[n]."""
    n = len(ref_env) + len(outro_env)
    tam = 1 << (n - 1).bit_length()
    corr = np.fft.irfft(np.fft.rfft(ref_env, tam) * np.conj(np.fft.rfft(outro_env, tam)), tam)
    # corr[k] = lag k (k >= 0); corr[tam - k] = lag -k
    positivos = corr[: min(max_lag, len(ref_env) - 1) + 1]
    negativos = corr[tam - min(max_lag, len(outro_env) - 1):][::-1]  # lags -1, -2, ...
    candidatos = np.concatenate([negativos[::-1], positivos])
    deslocamento = len(negativos)
    i = int(np.argmax(candidatos))
    pico = float(i - deslocamento)
    if 0 < i < len(candidatos) - 1:  # interpolação parabólica sub-amostra
        a, b, c = candidatos[i - 1], candidatos[i], candidatos[i + 1]
        den = a - 2 * b + c
        if den != 0:
            pico += 0.5 * (a - c) / den
    return pico


def estimar_atraso(ref: np.ndarray, outro: np.ndarray, taxa: int, max_seg: float = 120.0) -> float:
    """Segundos que `outro` começa depois de `ref` (negativo: começou antes)."""
    max_lag = int(max_seg * TAXA_ENVELOPE)
    return _lag_no_pico(_envelope(ref, taxa), _envelope(outro, taxa), max_lag) / TAXA_ENVELOPE


def alinhar(ref: np.ndarray, outro: np.ndarray, taxa: int, janela_seg: float = 60.0) -> Alinhamento:
    dur_ref, dur_outro = len(ref) / taxa, len(outro) / taxa
    if dur_outro < 3 * janela_seg:
        return Alinhamento(estimar_atraso(ref, outro, taxa, max_seg=dur_ref), 0.0)

    w = int(janela_seg * taxa)
    inicio_fim = len(outro) - w
    a0 = estimar_atraso(ref, outro[:w], taxa, max_seg=dur_ref)
    pos_fim = estimar_atraso(ref, outro[inicio_fim:], taxa, max_seg=dur_ref)
    a1 = pos_fim - inicio_fim / taxa
    t0 = a0 + janela_seg / 2
    t1 = pos_fim + janela_seg / 2
    deriva = (a1 - a0) / (t1 - t0)
    return Alinhamento(atraso=a0 - deriva * t0, deriva=deriva)


def tempo_em_outro(t_ref: float, al: Alinhamento) -> float:
    """Converte um instante da referência para o relógio do outro aparelho."""
    return t_ref - al.atraso - al.deriva * t_ref
