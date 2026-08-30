"""Rasterize Android launcher mipmaps + TV banner from CMS brand assets.

Sources of truth (admin panel branding):
  - ../../src/assets/e3-icon.png      → square launcher mark
  - ../../src/assets/e3-full-logo.png → TV banner wordmark
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

REPO_ROOT = Path(__file__).resolve().parents[3]
CMS_ICON = REPO_ROOT / "src" / "assets" / "e3-icon.png"
CMS_FULL_LOGO = REPO_ROOT / "src" / "assets" / "e3-full-logo.png"
RES = Path(__file__).resolve().parents[1] / "app" / "src" / "main" / "res"
MASTERS = Path(__file__).resolve().parent / "masters"

MIPMAP_LEGACY = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

ADAPTIVE_SIZES = {
    "drawable-mdpi": 108,
    "drawable-hdpi": 162,
    "drawable-xhdpi": 216,
    "drawable-xxhdpi": 324,
    "drawable-xxxhdpi": 432,
}


def save_png(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "PNG", optimize=True)


def resize(im: Image.Image, size: int) -> Image.Image:
    return im.resize((size, size), Image.Resampling.LANCZOS)


def content_bbox(im: Image.Image, alpha_min: int = 24) -> tuple[int, int, int, int]:
    alpha = im.split()[-1]
    box = alpha.point(lambda a: 255 if a >= alpha_min else 0).getbbox()
    if box is None:
        raise RuntimeError("Image has no opaque content")
    return box


def pad_to_safe_zone(im: Image.Image, canvas: int = 1024, fill_ratio: float = 0.62) -> Image.Image:
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


def solid_background(canvas: int = 1024, color: tuple[int, int, int, int] = (0, 0, 0, 255)) -> Image.Image:
    return Image.new("RGBA", (canvas, canvas), color)


def compose_legacy(background: Image.Image, foreground: Image.Image) -> Image.Image:
    out = background.convert("RGBA").copy()
    fg = foreground.convert("RGBA")
    if fg.size != out.size:
        fg = fg.resize(out.size, Image.Resampling.LANCZOS)
    out.alpha_composite(fg)
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


def make_tv_banner(logo: Image.Image, width: int = 1280, height: int = 720) -> Image.Image:
    """Full CMS logo centered on black 16:9 (Android TV banner)."""
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 255))
    rgba = logo.convert("RGBA")
    bbox = content_bbox(rgba)
    cropped = rgba.crop(bbox)
    # Leave comfortable margins so the wordmark stays readable on Leanback.
    max_w = int(width * 0.78)
    max_h = int(height * 0.55)
    scale = min(max_w / cropped.width, max_h / cropped.height)
    new_w = max(1, int(cropped.width * scale))
    new_h = max(1, int(cropped.height * scale))
    fitted = cropped.resize((new_w, new_h), Image.Resampling.LANCZOS)
    canvas.paste(fitted, ((width - new_w) // 2, (height - new_h) // 2), fitted)
    return canvas


def main() -> None:
    if not CMS_ICON.is_file():
        raise SystemExit(f"Missing CMS icon: {CMS_ICON}")
    if not CMS_FULL_LOGO.is_file():
        raise SystemExit(f"Missing CMS full logo: {CMS_FULL_LOGO}")

    icon = Image.open(CMS_ICON).convert("RGBA")
    full_logo = Image.open(CMS_FULL_LOGO).convert("RGBA")

    background = solid_background(1024)
    foreground = pad_to_safe_zone(icon, canvas=1024, fill_ratio=0.62)
    full = compose_legacy(background, foreground)
    banner = make_tv_banner(full_logo)

    MASTERS.mkdir(parents=True, exist_ok=True)
    save_png(full, MASTERS / "e3-launcher-icon-1024.png")
    save_png(background, MASTERS / "e3-launcher-background-1024.png")
    save_png(foreground, MASTERS / "e3-launcher-foreground-1024.png")
    save_png(banner, MASTERS / "e3-tv-banner.png")

    for folder, size in MIPMAP_LEGACY.items():
        square = resize(full, size)
        save_png(square, RES / folder / "ic_launcher.png")
        save_png(make_round(square), RES / folder / "ic_launcher_round.png")

    for folder, size in ADAPTIVE_SIZES.items():
        save_png(resize(background, size), RES / folder / "ic_launcher_background.png")
        save_png(resize(foreground, size), RES / folder / "ic_launcher_foreground.png")

    # TV banner: 320x180 dp — mdpi 320x180, xhdpi 640x360
    save_png(banner.resize((640, 360), Image.Resampling.LANCZOS), RES / "drawable-xhdpi" / "tv_banner.png")
    save_png(banner.resize((320, 180), Image.Resampling.LANCZOS), RES / "drawable-mdpi" / "tv_banner.png")

    print("CMS icon:", CMS_ICON)
    print("CMS full logo:", CMS_FULL_LOGO)
    print("Wrote masters under", MASTERS)
    print("Wrote launcher mipmaps under", RES)


if __name__ == "__main__":
    main()
