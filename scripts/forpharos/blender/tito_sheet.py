import bpy, math, sys, os
args=sys.argv[sys.argv.index('--')+1:]; out=args[0]; shots=[a.split(':') for a in args[1].split(',')]; ang=float(args[2]) if len(args)>2 else 30
bpy.ops.wm.open_mainfile(filepath=os.path.abspath('tito_anim.blend'))
sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.samples=8; sc.cycles.use_denoising=False
sc.render.resolution_x=360; sc.render.resolution_y=460
w=bpy.data.worlds.new('w'); sc.world=w; w.use_nodes=True; w.node_tree.nodes['Background'].inputs[0].default_value=(0.13,0.12,0.14,1)
ld=bpy.data.lights.new('sun','SUN'); ld.energy=3.5; lo=bpy.data.objects.new('sun',ld); sc.collection.objects.link(lo); lo.rotation_euler=(math.radians(50),0,math.radians(30))
cam=bpy.data.cameras.new('c'); cam.type='ORTHO'; cam.ortho_scale=2.7; co=bpy.data.objects.new('c',cam); sc.collection.objects.link(co); sc.camera=co
a=math.radians(ang); co.location=(6*math.sin(a), -6*math.cos(a), 0.6); co.rotation_euler=(math.radians(84),0,a)
arm=bpy.data.objects['Rig']; files=[]
for act,f in shots:
    arm.animation_data.action=bpy.data.actions[act]; sc.frame_set(int(f))
    p=os.path.abspath(f'{out}_{act}_{f}.png'); sc.render.filepath=p; bpy.ops.render.render(write_still=True); files.append(p)
from PIL import Image, ImageDraw
ims=[Image.open(p) for p in files]; o=Image.new('RGB',(360*len(ims),480),(20,18,20)); d=ImageDraw.Draw(o)
for i,(im,(act,f)) in enumerate(zip(ims,shots)): o.paste(im,(i*360,20)); d.text((i*360+6,4),f'{act} {f}',fill=(240,220,160))
o.save(os.path.abspath(out+'.png'))
