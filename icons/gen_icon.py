from PIL import Image, ImageDraw

CHARCOAL = (38, 36, 32, 255)
OFFWHITE = (246, 243, 238, 255)
CLAY = (181, 101, 63, 255)


def make_icon(size, path, corner_radius_ratio=0.22):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    r = int(size * corner_radius_ratio)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=CHARCOAL)

    cx, cy = size / 2, size / 2
    stroke = max(2, int(size * 0.045))

    # Hook
    hook_r = size * 0.07
    hook_cy = cy - size * 0.26
    draw.arc(
        [cx - hook_r, hook_cy - hook_r, cx + hook_r, hook_cy + hook_r],
        start=200,
        end=520,
        fill=OFFWHITE,
        width=stroke,
    )

    # Hanger body: two angled lines from center down to left/right, plus small crossbar
    top_x, top_y = cx, cy - size * 0.13
    left_x, left_y = cx - size * 0.26, cy + size * 0.14
    right_x, right_y = cx + size * 0.26, cy + size * 0.14

    draw.line([(top_x, top_y), (left_x, left_y)], fill=OFFWHITE, width=stroke, joint="curve")
    draw.line([(top_x, top_y), (right_x, right_y)], fill=OFFWHITE, width=stroke, joint="curve")
    draw.line([(left_x, left_y), (right_x, right_y)], fill=OFFWHITE, width=stroke, joint="curve")

    # small clay accent dot at the hook joint
    dot_r = size * 0.025
    draw.ellipse(
        [top_x - dot_r, top_y - dot_r, top_x + dot_r, top_y + dot_r],
        fill=CLAY,
    )

    img.save(path)


make_icon(192, "icon-192.png")
make_icon(512, "icon-512.png")
make_icon(180, "apple-touch-icon.png", corner_radius_ratio=0.0)
print("done")
