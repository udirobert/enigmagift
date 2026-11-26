#!/usr/bin/env python3
from pathlib import Path
import subprocess, json, sys, os

ROOT = Path(__file__).resolve().parent
FFMPEG = os.environ.get('FFMPEG', 'ffmpeg')
FFPROBE = os.environ.get('FFPROBE', 'ffprobe')
OUT = ROOT / 'out'
OUT.mkdir(exist_ok=True)

def dur(path):
    return float(subprocess.check_output([FFPROBE,'-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(path)], text=True).strip())

def run(cmd):
    print('+', ' '.join(map(str, cmd)), flush=True)
    subprocess.run(list(map(str, cmd)), check=True)

# visual, audio, output name, optional video slowdown factor
segments = []
def add_image(image, audio, name):
    segments.append(('image', ROOT/'slide-shots'/image, ROOT/'voice'/audio, OUT/f'{name}.mp4', None))
def add_clip(clip, audio, name):
    cp = ROOT/'recordings'/clip
    ap = ROOT/'voice'/audio
    segments.append(('clip', cp, ap, OUT/f'{name}.mp4', dur(ap)/dur(cp)))

add_image('01-title.png','01-title.aiff','01-title')
add_image('02-product-loop.png','02-product-loop.aiff','02-product-loop')
add_clip('creation.webm','03-creation.aiff','03-creation')
add_clip('recipient.webm','04-recipient.aiff','04-recipient')
add_image('04-verification-design.png','05-verification-design.aiff','05-verification-design')
add_image('05-gate-anatomy.png','06-gate.aiff','06-gate')
segments.append(('dual-image', (ROOT/'slide-shots'/'06-evidence.png', ROOT/'slide-shots'/'07-what-kane-caught.png'), ROOT/'voice'/'07-evidence.aiff', OUT/'07-evidence.mp4', 16.0))
add_image('08-agent-loop.png','08-agent-loop.aiff','08-agent-loop')
add_image('09-close.png','09-close.aiff','09-close')

for typ, visual, audio, out, factor in segments:
    ad = dur(audio)
    if typ == 'image':
        run([FFMPEG,'-y','-loop','1','-framerate','30','-i',visual,'-i',audio,
             '-t',f'{ad:.3f}','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-r','30',
             '-c:a','aac','-b:a','160k','-ar','48000','-movflags','+faststart',out])
    elif typ == 'dual-image':
        first, second = visual
        split = min(float(factor), max(1.0, ad - 1.0))
        rest = ad - split
        run([FFMPEG,'-y',
             '-loop','1','-framerate','30','-t',f'{split:.3f}','-i',first,
             '-loop','1','-framerate','30','-t',f'{rest:.3f}','-i',second,
             '-i',audio,
             '-filter_complex','[0:v]format=yuv420p,setsar=1[v0];[1:v]format=yuv420p,setsar=1[v1];[v0][v1]concat=n=2:v=1:a=0[v]',
             '-map','[v]','-map','2:a','-t',f'{ad:.3f}',
             '-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-r','30',
             '-c:a','aac','-b:a','160k','-ar','48000','-movflags','+faststart',out])
    else:
        run([FFMPEG,'-y','-i',visual,'-i',audio,
             '-filter_complex',f'[0:v]setpts={factor:.9f}*PTS,fps=30,format=yuv420p[v]',
             '-map','[v]','-map','1:a','-t',f'{ad:.3f}',
             '-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-r','30',
             '-c:a','aac','-b:a','160k','-ar','48000','-movflags','+faststart',out])

concat = OUT/'concat.txt'
concat.write_text(''.join(f"file '{p.name}'\n" for *_, p, _f in [(t,v,a,o,f) for t,v,a,o,f in segments]))
# The comprehension above is intentionally simple; write exact ordered list instead.
concat.write_text(''.join(f"file '{outp.name}'\n" for _t,_v,_a,outp,_f in segments))
final = ROOT/'enigmagift-kanecli-demo.mp4'
run([FFMPEG,'-y','-f','concat','-safe','0','-i',concat,'-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-r','30','-c:a','aac','-b:a','160k','-ar','48000','-movflags','+faststart',final])
print(final)
print('duration', dur(final))
