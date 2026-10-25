#!/bin/bash
set -euo pipefail
APPLE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
python3 - "$APPLE_DIR" <<'PY'
import json, pathlib, struct, subprocess, sys, zlib
apple = pathlib.Path(sys.argv[1])
source = apple.parents[1] / 'public/logo-source.png'
data = source.read_bytes()
assert data[:8] == b'\x89PNG\r\n\x1a\n', 'Source PNG requise'
pos, compressed = 8, bytearray()
while pos < len(data):
    length = struct.unpack('>I', data[pos:pos+4])[0]
    kind, payload = data[pos+4:pos+8], data[pos+8:pos+8+length]
    if kind == b'IHDR':
        width, height, depth, color, compression, filtering, interlace = struct.unpack('>IIBBBBB', payload)
    if kind == b'IDAT': compressed.extend(payload)
    pos += 12 + length
assert (width, height, depth, color, interlace) == (1024, 1024, 8, 6, 0), 'Source RGBA 1024 non entrelacée requise'
raw, previous, pixels = zlib.decompress(compressed), bytearray(width*4), bytearray()
def paeth(a, b, c):
    p = a+b-c
    distances = [abs(p-a), abs(p-b), abs(p-c)]
    return [a,b,c][distances.index(min(distances))]
for y in range(height):
    offset = y*(width*4+1)
    mode, row = raw[offset], bytearray(raw[offset+1:offset+1+width*4])
    for x in range(len(row)):
        left = row[x-4] if x >= 4 else 0
        up, corner = previous[x], previous[x-4] if x >= 4 else 0
        predictor = [0, left, up, (left+up)//2, paeth(left,up,corner)][mode]
        row[x] = (row[x]+predictor) & 255
    pixels.extend(row)
    previous = row

def png(path, rgb, channels):
    def chunk(kind, payload):
        return struct.pack('>I',len(payload))+kind+payload+struct.pack('>I',zlib.crc32(kind+payload)&0xffffffff)
    scan = b''.join(b'\0'+rgb[y*width*channels:(y+1)*width*channels] for y in range(height))
    header = struct.pack('>IIBBBBB',width,height,8,6 if channels == 4 else 2,0,0,0)
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',header)+chunk(b'sRGB',b'\0')+chunk(b'IDAT',zlib.compress(scan,9))+chunk(b'IEND',b''))

light, dark, tinted = bytearray(), bytearray(), bytearray()
for i in range(0,len(pixels),4):
    r,g,b,a = pixels[i:i+4]
    # Le tracé clair du logo devient un masque monochrome, sans fond noir résiduel.
    gray = ((299*r+587*g+114*b)//1000)*a//255
    light.extend((255*gray+bg*(255-gray)+127)//255 for bg in (14,165,233))
    dark.extend((255,255,255,gray))
    tinted.extend((gray,gray,gray))
app = apple/'App/Assets.xcassets/AppIcon.appiconset'
watch = apple/'WatchApp/Assets.xcassets/AppIcon.appiconset'
for path in (app,watch):
    path.mkdir(parents=True,exist_ok=True)
    (path.parent/'Contents.json').write_text(json.dumps({'info':{'author':'xcode','version':1}},indent=2)+'\n')
png(app/'ios-light.png',light,3)
png(app/'ios-dark.png',dark,4)
png(app/'ios-tinted.png',tinted,3)
png(watch/'watch-1024.png',light,3)
images = [{'filename':'ios-light.png','idiom':'universal','platform':'ios','size':'1024x1024'}]
for appearance in ('dark','tinted'):
    images.append({'filename':f'ios-{appearance}.png','idiom':'universal','platform':'ios','size':'1024x1024','appearances':[{'appearance':'luminosity','value':appearance}]})
for size in (16,32,128,256,512):
    for scale in (1,2):
        name=f'mac-{size}@{scale}x.png'
        subprocess.run(['sips','-z',str(size*scale),str(size*scale),str(app/'ios-light.png'),'--out',str(app/name)],check=True,stdout=subprocess.DEVNULL)
        images.append({'filename':name,'idiom':'mac','size':f'{size}x{size}','scale':f'{scale}x'})
(app/'Contents.json').write_text(json.dumps({'images':images,'info':{'author':'xcode','version':1}},indent=2)+'\n')
(watch/'Contents.json').write_text(json.dumps({'images':[{'filename':'watch-1024.png','idiom':'universal','platform':'watchos','size':'1024x1024'}],'info':{'author':'xcode','version':1}},indent=2)+'\n')
print('Icônes générées depuis public/logo-source.png')
PY
