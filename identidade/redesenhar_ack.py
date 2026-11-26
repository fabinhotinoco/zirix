"""Reconstrói o logo da ACK em alta definição a partir do arquivo pequeno (300x160).

O arquivo recebido não tem resolução para TV. As formas do A, do C e do K são
simples, então são extraídas por cor, ampliadas e suavizadas até ficarem com
borda limpa; "sistemas automotivos" é redigitado. Cores mantidas do original.
Provisório até a ACK enviar o arquivo vetorial oficial (SVG, PDF ou AI).
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ENTRADA, SAIDA = Path(sys.argv[1]), Path(sys.argv[2])
K = 8                                  # ampliação
BRANCO, AMARELO = (255, 255, 255), (248, 232, 16)
VERDE_TEXTO, CONTORNO = (196, 204, 60), (30, 50, 45)

im = Image.open(ENTRADA).convert("RGBA")
w, h = im.size
corte = int(h * 0.76)                  # abaixo disso fica o texto


def mascara(teste) -> Image.Image:
    m = Image.new("L", (w, h), 0)
    px, pm = im.load(), m.load()
    for y in range(corte):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 90 and teste(r, g, b):
                pm[x, y] = 255
    return m


def suave(m: Image.Image, limiar: int = 128, raio: float = 0.9 * K) -> Image.Image:
    m = m.filter(ImageFilter.MedianFilter(3))   # remove pontinhos soltos
    grande = m.resize((w * K, h * K), Image.BICUBIC).filter(ImageFilter.GaussianBlur(raio))
    return grande.point(lambda v: 255 if v >= limiar else 0)


amarelo = mascara(lambda r, g, b: r > 170 and g > 150 and b < 120)
letras = mascara(lambda r, g, b: not (r > 170 and g > 150 and b < 120))  # A e K com o contorno
# o contorno escuro em volta do C pertence ao C: tira-o da máscara do A/K
from PIL import ImageChops
perto_do_c = amarelo.filter(ImageFilter.MaxFilter(7))
letras = ImageChops.subtract(letras, perto_do_c)

forma_ak = suave(letras)
forma_c = suave(amarelo)
contorno_ak = forma_ak.filter(ImageFilter.GaussianBlur(1.8 * K)).point(lambda v: 255 if v >= 25 else 0)
miolo_ak = forma_ak.filter(ImageFilter.GaussianBlur(1.8 * K)).point(lambda v: 255 if v >= 230 else 0)
contorno_c = forma_c.filter(ImageFilter.GaussianBlur(1.8 * K)).point(lambda v: 255 if v >= 25 else 0)

W, H = w * K, h * K
out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
for mask, cor in ((contorno_ak, CONTORNO), (miolo_ak, BRANCO), (contorno_c, CONTORNO), (forma_c, AMARELO)):
    camada = Image.new("RGBA", (W, H), cor + (255,))
    out.paste(camada, (0, 0), mask)

# texto redigitado na largura do original
fonte = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 15 * K)
texto = "sistemas automotivos"
tmp = Image.new("RGBA", (W * 2, 40 * K), (0, 0, 0, 0))
ImageDraw.Draw(tmp).text((2 * K, 2 * K), texto, font=fonte, fill=VERDE_TEXTO,
                         stroke_width=int(1.2 * K), stroke_fill=CONTORNO)
tmp = tmp.crop(tmp.getbbox())
alvo_l, alvo_x = int(0.62 * W), int(0.2 * W)             # mesma largura e posição do original
tmp = tmp.resize((alvo_l, int(tmp.height * 0.78)), Image.LANCZOS)
out.alpha_composite(tmp, (alvo_x, int(corte * K + 0.02 * H)))
out = out.crop(out.getbbox())
out.save(SAIDA)
print(SAIDA, out.size)
