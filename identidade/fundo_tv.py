"""Fundo de tela da TV do set do Zirix Podcast (1920x1080).

Logo da Zirix + "PODCAST" e, na faixa de baixo, espaço para patrocinadores.
Os logos dos patrocinadores são repintados numa cor só da paleta da Zirix,
para o fundo manter a nossa identidade de cores.

Uso:
    python3 identidade/fundo_tv.py saida.png
    python3 identidade/fundo_tv.py saida.png --patrocinadores a.png b.png --cor cinza
    python3 identidade/fundo_tv.py saida.png --sem-faixa
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

AQUI = Path(__file__).parent
FB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
W, H = 1920, 1080
VERMELHO = (206, 51, 47)      # #CE332F, medido no logo
GRAFITE = (58, 58, 60)
CINZA = (120, 120, 124)
FUNDO = (248, 247, 245)
FAIXA = (239, 237, 233)
CORES = {"vermelho": VERMELHO, "grafite": GRAFITE, "cinza": CINZA}
MAX_PATROCINADORES = 4


def fonte(tam: int, negrito: bool = True) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FB if negrito else FR, tam)


def monocromatico(caminho: Path, rgb: tuple[int, int, int]) -> Image.Image:
    """Logo do patrocinador numa cor só, preservando o desenho (alfa ou luminância)."""
    im = Image.open(caminho).convert("RGBA")
    alfa = im.getchannel("A")
    if alfa.getextrema() == (255, 255):
        # Sem transparência: o fundo é a cor do canto; o desenho é o que difere dela.
        fundo = im.getpixel((0, 0))[:3]
        rgb_im = im.convert("RGB")
        dist = Image.eval(rgb_im.split()[0], lambda v: abs(v - fundo[0]))
        for canal, ref in zip(rgb_im.split()[1:], fundo[1:]):
            dist = ImageChops.lighter(dist, Image.eval(canal, lambda v, r=ref: abs(v - r)))
        alfa = dist.point(lambda v: 255 if v > 24 else 0)
    saida = Image.new("RGBA", im.size, rgb + (0,))
    saida.putalpha(alfa)
    caixa = saida.getbbox()
    return saida.crop(caixa) if caixa else saida


def caber(im: Image.Image, w: int, h: int) -> Image.Image:
    k = min(w / im.width, h / im.height)
    return im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)


def nome_como_logo(nome: str, rgb: tuple[int, int, int]) -> Image.Image:
    """Provisório enquanto não há o arquivo do logo: o nome da empresa em texto."""
    f = fonte(50)
    tmp = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    w = int(tmp.textlength(nome, font=f)) + 10
    im = Image.new("RGBA", (w, 90), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((5, 5), nome, font=f, fill=rgb + (255,))
    return im.crop(im.getbbox())


def gerar(saida: Path, patrocinadores: list[Path | str], cor: str = "grafite", faixa: bool = True) -> Path:
    """`patrocinadores`: arquivo de logo (PNG/JPG) ou, se não for arquivo, o nome da empresa."""
    if len(patrocinadores) > MAX_PATROCINADORES:
        raise ValueError(f"no máximo {MAX_PATROCINADORES} patrocinadores na faixa")
    im = Image.new("RGBA", (W, H), FUNDO + (255,))
    d = ImageDraw.Draw(im)
    topo = 0 if faixa else 110  # sem faixa, o bloco principal desce para o centro

    logo = Image.open(AQUI / "logo-zirix.png").convert("RGBA")
    logo = caber(logo, 760, 300)
    im.alpha_composite(logo, (200, 300 + topo - logo.height // 2 + 130))
    d.rectangle([1030, 280 + topo, 1038, 600 + topo], fill=VERMELHO)
    d.text((1090, 300 + topo), "PODCAST", font=fonte(124), fill=VERMELHO)
    d.text((1096, 470 + topo), "a conversa de quem", font=fonte(46, False), fill=(70, 70, 70))
    d.text((1096, 530 + topo), "opera ônibus", font=fonte(46, False), fill=(70, 70, 70))

    if faixa:
        d.rectangle([0, 800, W, H], fill=FAIXA)
        d.rectangle([0, 800, W, 806], fill=VERMELHO)
        d.text((200, 900), "APOIO", font=fonte(34), fill=VERMELHO)
        slot_w, slot_h, gap, x0, y0 = 300, 130, 40, 420, 860
        for i in range(MAX_PATROCINADORES):
            x = x0 + i * (slot_w + gap)
            if i < len(patrocinadores):
                item = patrocinadores[i]
                bruto = (monocromatico(Path(item), CORES[cor]) if Path(item).is_file()
                         else nome_como_logo(str(item), CORES[cor]))
                # nomes em texto mantêm o mesmo tamanho; só logos de arquivo são ajustados à caixa
                lg = caber(bruto, slot_w - 40, slot_h - 50) if Path(item).is_file() or bruto.width > slot_w - 40 else bruto
                im.alpha_composite(lg, (x + (slot_w - lg.width) // 2, y0 + (slot_h - lg.height) // 2))
            elif not patrocinadores:
                d.rounded_rectangle([x, y0, x + slot_w, y0 + slot_h], 14, outline=(200, 198, 194), width=3)
                t = "SEU LOGO AQUI"
                d.text((x + (slot_w - d.textlength(t, font=fonte(24))) / 2, y0 + 50), t,
                       font=fonte(24), fill=(170, 168, 164))
    im.convert("RGB").save(saida)
    return Path(saida)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("saida", type=Path)
    ap.add_argument("--patrocinadores", nargs="*", default=[],
                    help="arquivo do logo ou nome da empresa (texto provisório)")
    ap.add_argument("--cor", choices=sorted(CORES), default="grafite")
    ap.add_argument("--sem-faixa", action="store_true")
    a = ap.parse_args()
    print(gerar(a.saida, a.patrocinadores, a.cor, not a.sem_faixa))
