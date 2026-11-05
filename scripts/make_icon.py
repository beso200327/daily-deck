#!/usr/bin/env python3
"""Recreate the original Daily Deck app icon (Pillow is optional, build uses committed PNG)."""
import json
from pathlib import Path
from PIL import Image, ImageDraw
root = Path(__file__).resolve().parents[1] / 'DailyDeck/Resources/Assets.xcassets'
size = 2048
im = Image.new('RGB', (size, size), '#FBF6EC')
d = ImageDraw.Draw(im)
d.rounded_rectangle((560, 400, 1580, 1700), radius=170, fill='#FFD1B5')
d.rounded_rectangle((430, 320, 1450, 1620), radius=170, fill='#E9E5D8', outline='#D7D2C8', width=4)
d.rounded_rectangle((300, 240, 1320, 1540), radius=170, fill='#FDF9F1', outline='#D7D2C8', width=4)
d.ellipse((485, 610, 1135, 1260), fill='#CDE852')
d.line([(650, 925), (775, 1050), (1010, 800)], fill='#292621', width=54, joint='curve')
d.rounded_rectangle((480, 430, 1040, 480), radius=25, fill='#292621')
im.resize((1024, 1024), Image.Resampling.LANCZOS).save(root/'AppIcon.appiconset/Icon.png')
(root/'Contents.json').write_text(json.dumps({'info': {'author': 'xcode', 'version': 1}}))
(root/'AppIcon.appiconset/Contents.json').write_text(json.dumps({'images': [{'filename': 'Icon.png', 'idiom': 'universal', 'platform': 'ios', 'size': '1024x1024'}], 'info': {'author': 'xcode', 'version': 1}}, indent=2))
