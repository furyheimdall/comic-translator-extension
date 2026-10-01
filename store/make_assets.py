"""Generate the extension icons and the Chrome Web Store promo tile.

Run from the repository root:  python3 store/make_assets.py
Needs Pillow and the Noto Sans CJK Bold font (Debian/Ubuntu: fonts-noto-cjk).
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
KR = 1  # face index of the Korean subset inside the collection
BLUE, DEEP, WHITE = (52, 88, 206), (33, 58, 150), (255, 255, 255)


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT, size, index=KR)


def icon(size: int = 512) -> Image.Image:
    """Blue rounded tile with a speech bubble saying 가 (Korean) and a small あ (Japanese source)."""
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    s = size / 512
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=int(112 * s), fill=BLUE)
    # Speech bubble with a tail at the bottom left.
    draw.rounded_rectangle((70 * s, 86 * s, 442 * s, 374 * s), radius=int(84 * s), fill=WHITE)
    draw.polygon([(128 * s, 340 * s), (110 * s, 448 * s), (226 * s, 356 * s)], fill=WHITE)
    draw.text((256 * s, 232 * s), "가", font=font(int(220 * s)), fill=DEEP, anchor="mm")
    # Small source-language mark in the top right corner.
    draw.ellipse((360 * s, 22 * s, 490 * s, 152 * s), fill=DEEP)
    draw.text((425 * s, 84 * s), "あ", font=font(int(84 * s)), fill=WHITE, anchor="mm")
    return image


def promo() -> Image.Image:
    tile = Image.new("RGB", (440, 280), (243, 245, 251))
    draw = ImageDraw.Draw(tile)
    draw.rectangle((0, 0, 440, 280), fill=(243, 245, 251))
    draw.rectangle((0, 0, 440, 12), fill=BLUE)
    tile.paste(icon(132), (26, 74), icon(132))
    draw.text((176, 92), "만화 번역", font=font(40), fill=(29, 41, 66))
    draw.text((178, 148), "日本語 → 한국어", font=font(22), fill=BLUE)
    draw.text((178, 184), "내 번역 서버로", font=font(18), fill=(100, 112, 138))
    draw.text((178, 210), "웹 만화 이미지를 그 자리에서", font=font(18), fill=(100, 112, 138))
    return tile


def main() -> None:
    master = icon()
    icons = ROOT / "icons"
    icons.mkdir(exist_ok=True)
    for size in (16, 32, 48, 128):
        master.resize((size, size), Image.LANCZOS).save(icons / f"icon{size}.png", optimize=True)
    store = ROOT / "store" / "images"
    store.mkdir(parents=True, exist_ok=True)
    master.resize((128, 128), Image.LANCZOS).save(store / "store-icon-128.png", optimize=True)
    promo().save(store / "promo-small-440x280.png", optimize=True)
    print("wrote icons/icon{16,32,48,128}.png and store/images/{store-icon-128,promo-small-440x280}.png")


if __name__ == "__main__":
    main()
