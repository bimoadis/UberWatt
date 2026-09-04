from PIL import Image, ImageDraw

def create_icon(size: int, filename: str):
    # Create background image with brand theme color #2E7D32
    img = Image.new('RGBA', (size, size), color='#2E7D32')
    draw = ImageDraw.Draw(img)

    # Draw a clean lightning / power icon in the center
    # Scale polygon coordinates based on size
    center = size / 2
    scale = size / 512.0

    points = [
        (280 * scale, 80 * scale),
        (160 * scale, 280 * scale),
        (240 * scale, 280 * scale),
        (210 * scale, 430 * scale),
        (350 * scale, 220 * scale),
        (270 * scale, 220 * scale)
    ]

    # Draw lightning bolt in crisp white #FFFFFF
    draw.polygon(points, fill='#FFFFFF')

    img.save(filename, 'PNG')
    print(f"Created {filename} ({size}x{size})")

if __name__ == "__main__":
    create_icon(192, "d:/Real Kerja/UberWatt/frontend/public/icon-192.png")
    create_icon(512, "d:/Real Kerja/UberWatt/frontend/public/icon-512.png")
