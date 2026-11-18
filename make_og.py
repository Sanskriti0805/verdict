# Generates og.png — the 1200x630 card WhatsApp shows when the link is forwarded.
# Run: python make_og.py

from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1200, 630
BG = (15, 17, 21)
INK = (238, 241, 246)
DIM = (164, 173, 189)
ACCENT = (255, 209, 102)
BAD = (255, 141, 123)
SURFACE = (30, 34, 43)

FONT_DIRS = [r"C:\Windows\Fonts"]
CANDIDATES_BOLD = ["segoeuib.ttf", "arialbd.ttf", "calibrib.ttf"]
CANDIDATES_REG = ["segoeui.ttf", "arial.ttf", "calibri.ttf"]


def pick(names, size):
    for d in FONT_DIRS:
        for n in names:
            p = os.path.join(d, n)
            if os.path.exists(p):
                return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def tracked(draw, xy, text, font, fill, spacing=0):
    """Draw text with manual letter spacing — PIL has no tracking."""
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + spacing
    return x


img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)

f_label = pick(CANDIDATES_BOLD, 26)
f_head = pick(CANDIDATES_BOLD, 58)
f_sub = pick(CANDIDATES_REG, 27)
f_small = pick(CANDIDATES_REG, 22)
f_card = pick(CANDIDATES_BOLD, 33)

PAD = 84
CARD_X = 672          # left column must end before this
LEFT_MAX = CARD_X - 40

# Wordmark
tracked(d, (PAD, 72), "VERDICT", f_label, ACCENT, spacing=4)

# Headline
head_lines = ["Nobody tells you", "why you were cut."]
y = 150
for line in head_lines:
    d.text((PAD, y), line, font=f_head, fill=INK)
    y += 70

# Subhead
sub_lines = [
    "Log one round you've been through.",
    "See what's actually getting students",
    "rejected, company by company.",
]
y = 322
for line in sub_lines:
    d.text((PAD, y), line, font=f_sub, fill=DIM)
    y += 40

# A hint of the chart, so the card looks like the product rather than a quote.
bar_x, bar_y, bar_w, bar_h, gap = PAD, 478, 400, 13, 26
for frac in (1.0, 0.62, 0.34):
    d.rounded_rectangle([bar_x, bar_y, bar_x + bar_w, bar_y + bar_h],
                        radius=7, fill=SURFACE)
    d.rounded_rectangle([bar_x, bar_y, bar_x + int(bar_w * frac), bar_y + bar_h],
                        radius=7, fill=BAD)
    bar_y += gap

# Right-hand proof block
d.rounded_rectangle([CARD_X, 150, W - PAD + 20, 470], radius=20,
                    fill=(23, 26, 33), outline=(42, 47, 58), width=2)
d.text((CARD_X + 34, 190), "Most common reason", font=f_small, fill=DIM)
d.text((CARD_X + 34, 220), "at the online test", font=f_small, fill=DIM)
d.text((CARD_X + 34, 274), "Below the CGPA", font=f_card, fill=INK)
d.text((CARD_X + 34, 314), "or marks cutoff", font=f_card, fill=INK)
d.text((CARD_X + 34, 390), "Every number shows its n.", font=f_small, fill=(109, 118, 136))

# Fail loudly if anything in the left column would run under the card.
for line, fnt in [(l, f_head) for l in head_lines] + [(l, f_sub) for l in sub_lines]:
    end = PAD + d.textlength(line, font=fnt)
    assert end < LEFT_MAX, "overflows the card: %r ends at %d" % (line, end)

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "og.png")
img.save(out, "PNG", optimize=True)
print("wrote", out, os.path.getsize(out), "bytes", img.size)
