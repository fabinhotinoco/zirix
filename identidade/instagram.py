"""Peças do Zirix Podcast para o Instagram, com a mesma identidade do fundo da TV.

Gera: post 4:5 (1080x1350, formato padrão do feed), post quadrado (1080x1080),
story/reels (1080x1920) e foto de perfil (1080x1080, conteúdo dentro do círculo).
Topo vermelho com o logo da Zirix e "PODCAST"; faixa branca com os apoiadores
nas cores originais.

Uso:
    python3 identidade/instagram.py PASTA_SAIDA --patrocinadores a.png b.png c.png d.png
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw

from fundo_tv import VERMELHO, _logo, caber, fonte, original

BRANCO = (255, 255, 255)
TEXTO_CLARO = (255, 232, 230)


def _centro(d: ImageDraw.ImageDraw, largura: int, y: int, texto: str, f, cor) -> None:
    d.text(((largura - d.textlength(texto, font=f)) / 2, y), texto, font=f, fill=cor)


def _bloco_marca(im: Image.Image, larg_logo: int, y: int, tam_podcast: int, tam_sub: int,
                 subtitulo: bool = True) -> int:
    """Logo branco + P O D C A S T + subtítulo, centralizados. Devolve o y final."""
    d = ImageDraw.Draw(im)
    lg = _logo(BRANCO, larg_logo, larg_logo)
    im.alpha_composite(lg, ((im.width - lg.width) // 2, y))
    y += lg.height + int(tam_podcast * 0.45)
    _centro(d, im.width, y, "P O D C A S T", fonte(tam_podcast), BRANCO)
    y += int(tam_podcast * 1.35)
    if subtitulo:
        _centro(d, im.width, y, "a conversa de quem opera ônibus", fonte(tam_sub, False), TEXTO_CLARO)
        y += int(tam_sub * 1.4)
    return y


def _faixa_apoio(im: Image.Image, y0: int, logos: list[Path], colunas: int) -> None:
    d = ImageDraw.Draw(im)
    d.rectangle([0, y0, im.width, im.height], fill=BRANCO)
    f = fonte(34)
    _centro(d, im.width, y0 + 40, "APOIO", f, VERMELHO)
    if not logos:
        return
    linhas = (len(logos) + colunas - 1) // colunas
    margem, topo = 70, y0 + 110
    cel_w = (im.width - 2 * margem) // colunas
    cel_h = min(170, (im.height - topo - 50) // linhas)
    for i, caminho in enumerate(logos):
        lin, col = divmod(i, colunas)
        bruto = original(caminho)
        # mesmo "peso visual": todos com a mesma área, sem passar do tamanho da célula
        alvo = (cel_w - 60) * (cel_h - 40) * 0.42
        k = (alvo / (bruto.width * bruto.height)) ** 0.5
        k = min(k, (cel_w - 60) / bruto.width, (cel_h - 40) / bruto.height)
        lg = bruto.resize((max(1, int(bruto.width * k)), max(1, int(bruto.height * k))), Image.LANCZOS)
        x = margem + col * cel_w + (cel_w - lg.width) // 2
        y = topo + lin * cel_h + (cel_h - lg.height) // 2
        im.alpha_composite(lg, (x, y))


def post(saida: Path, logos: list[Path], altura: int) -> Path:
    im = Image.new("RGBA", (1080, altura), VERMELHO + (255,))
    faixa = 420 if altura >= 1300 else 330
    area = altura - faixa
    alto_bloco = 760 * 0.46 + 110 * 1.8 + 40 * 1.4   # estimativa da altura do bloco de marca
    _bloco_marca(im, 760, int((area - alto_bloco) / 2), 96, 40)
    _faixa_apoio(im, altura - faixa, logos, colunas=2 if altura >= 1300 else 4)
    im.convert("RGB").save(saida, quality=95)
    return saida


def story(saida: Path, logos: list[Path]) -> Path:
    im = Image.new("RGBA", (1080, 1920), VERMELHO + (255,))
    # áreas seguras do story: ~250 px no topo e ~300 px embaixo ficam sob a interface
    _bloco_marca(im, 860, 560, 110, 44)
    _faixa_apoio(im, 1920 - 640, logos, colunas=2)
    im.convert("RGB").save(saida, quality=95)
    return saida


def perfil(saida: Path) -> Path:
    im = Image.new("RGBA", (1080, 1080), VERMELHO + (255,))
    # o Instagram corta em círculo: tudo dentro de ~70% do centro
    y = _bloco_marca(im, 640, 0, 96, 0, subtitulo=False)
    bloco = im.crop((0, 0, 1080, y)).copy()
    im = Image.new("RGBA", (1080, 1080), VERMELHO + (255,))
    im.alpha_composite(bloco, (0, (1080 - y) // 2 + 20))
    im.convert("RGB").save(saida, quality=95)
    return saida


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pasta", type=Path)
    ap.add_argument("--patrocinadores", type=Path, nargs="*", default=[])
    a = ap.parse_args()
    a.pasta.mkdir(parents=True, exist_ok=True)
    print(post(a.pasta / "instagram-post-4x5.jpg", a.patrocinadores, 1350))
    print(post(a.pasta / "instagram-post-quadrado.jpg", a.patrocinadores, 1080))
    print(story(a.pasta / "instagram-story.jpg", a.patrocinadores))
    print(perfil(a.pasta / "instagram-perfil.jpg"))
