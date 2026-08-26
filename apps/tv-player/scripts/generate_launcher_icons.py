"""Rasterize E3 Signage launcher mipmaps and the TV banner from generated masters."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(r"C:\Users\patha\.cursor\projects\a-Live-Projects-E3-Signage-Studio\assets")
RES = Path(__file__).resolve().parents[1] / "app" / "src" / "main" / "res"

MIPMAP_LEGACY = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}


def save_png(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "PNG", optimize=True)


def resize(im: Image.Image, size: int) -> Image.Image:
    return im.resize((size, size), Image.Resampling.LANCZOS)


def knockout_light_checker(im: Image.Image) -> Image.Image:
    """AI 'transparent' masters often bake a gray/white checkerboard as RGB."""
    rgba = im.convert("RGBA")
    pixels = rgba.load()
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, _a = pixels[x, y]
            sat = max(r, g, b) - min(r, g, b)
            lum = (r + g + b) / 3
            if sat < 28 and lum > 150:
                pixels[x, y] = (0, 0, 0, 0)
            elif sat < 18 and lum > 90:
                pixels[x, y] = (0, 0, 0, 0)
    return rgba


def content_bbox(im: Image.Image, alpha_min: int = 24) -> tuple[int, int, int, int]:
    alpha = im.split()[-1]
    box = alpha.point(lambda a: 255 if a >= alpha_min else 0).getbbox()
    if box is None:
        raise RuntimeError("Foreground has no opaque content")
    return box


def pad_to_safe_zone(im: Image.Image, canvas: int = 1024, fill_ratio: float = 0.58) -> Image.Image:
    """Center artwork in the adaptive-icon safe zone (~66dp of 108dp)."""
    bbox = content_bbox(im)
    cropped = im.crop(bbox)
    target = int(canvas * fill_ratio)
    scale = min(target / cropped.width, target / cropped.height)
    new_w = max(1, int(cropped.width * scale))
    new_h = max(1, int(cropped.height * scale))
    fitted = cropped.resize((new_w, new_h), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    out.paste(fitted, ((canvas - new_w) // 2, (canvas - new_h) // 2), fitted)
    return out


def circular_mask(size: int) -> Image.Image:
    scale = 4
    big = size * scale
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, big - 1, big - 1), fill=255)
    return mask.resize((size, size), Image.Resampling.LANCZOS)


def make_round(im: Image.Image) -> Image.Image:
    rgba = im.convert("RGBA")
    mask = circular_mask(rgba.size[0])
    alpha = Image.composite(rgba.split()[-1], Image.new("L", rgba.size, 0), mask)
    rgba.putalpha(alpha)
    return rgba


def crop_banner_16x9(im: Image.Image) -> Image.Image:
    w, h = im.size
    target_h = int(round(w * 9 / 16))
    if target_h <= h:
        top = (h - target_h) // 2
        return im.crop((0, top, w, top + target_h))
    target_w = int(round(h * 16 / 9))
    left = (w - target_w) // 2
    return im.crop((left, 0, left + target_w, h))


def main() -> None:
    full = Image.open(ASSETS / "e3-launcher-icon-1024.png").convert("RGBA")
    background = Image.open(ASSETS / "e3-launcher-background-1024.png").convert("RGBA")
    foreground = pad_to_safe_zone(knockout_light_checker(Image.open(ASSETS / "e3-launcher-foreground-1024.png")))
    banner = crop_banner_16x9(Image.open(ASSETS / "e3-tv-banner.png").convert("RGBA"))

    for folder, size in MIPMAP_LEGACY.items():
        square = resize(full, size)
        save_png(square, RES / folder / "ic_launcher.png")
        save_png(make_round(square), RES / folder / "ic_launcher_round.png")

    # High-res adaptive layers; XML in mipmap-anydpi-v26 references these drawables.
    save_png(resize(background, 432), RES / "drawable-xxxhdpi" / "ic_launcher_background.png")
    save_png(resize(foreground, 432), RES / "drawable-xxxhdpi" / "ic_launcher_foreground.png")
    save_png(resize(background, 108), RES / "drawable-mdpi" / "ic_launcher_background.png")
    save_png(resize(foreground, 108), RES / "drawable-mdpi" / "ic_launcher_foreground.png")
    save_png(resize(background, 162), RES / "drawable-hdpi" / "ic_launcher_background.png")
    save_png(resize(foreground, 162), RES / "drawable-hdpi" / "ic_launcher_foreground.png")
    save_png(resize(background, 216), RES / "drawable-xhdpi" / "ic_launcher_background.png")
    save_png(resize(foreground, 216), RES / "drawable-xhdpi" / "ic_launcher_foreground.png")
    save_png(resize(background, 324), RES / "drawable-xxhdpi" / "ic_launcher_background.png")
    save_png(resize(foreground, 324), RES / "drawable-xxhdpi" / "ic_launcher_foreground.png")

    # TV banner: 320x180 dp at xhdpi = 640x360 px
    banner_xhdpi = banner.resize((640, 360), Image.Resampling.LANCZOS)
    save_png(banner_xhdpi, RES / "drawable-xhdpi" / "tv_banner.png")
    save_png(banner.resize((320, 180), Image.Resampling.LANCZOS), RES / "drawable-mdpi" / "tv_banner.png")

    print("Wrote launcher mipmaps under", RES)


if __name__ == "__main__":
    main()
