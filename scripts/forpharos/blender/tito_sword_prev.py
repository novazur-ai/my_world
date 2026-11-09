import bpy, math, os
bpy.ops.wm.open_mainfile(filepath=os.path.abspath('tito_anim.blend'))
sc=bpy.context.scene; sw=bpy.data.objects['Epee']; me=sw.data; me.calc_loop_triangles(); print('triangles epee', len(me.loop_triangles))
for o in bpy.data.objects:
    if o.name!='Epee' and o.type=='MESH': o.hide_render=True
sw.parent=None; sw.matrix_world=__import__('mathutils').Matrix.Identity(4)
sc.render.engine='CYCLES'; sc.cycles.samples=24; sc.cycles.use_denoising=False; sc.render.resolution_x=360; sc.render.resolution_y=800
w=bpy.data.worlds.new('w'); sc.world=w; w.use_nodes=True; w.node_tree.nodes['Background'].inputs[0].default_value=(0.3,0.3,0.33,1)
ld=bpy.data.lights.new('sun','SUN'); ld.energy=4; lo=bpy.data.objects.new('sun',ld); sc.collection.objects.link(lo); lo.rotation_euler=(math.radians(40),math.radians(20),math.radians(30))
cam=bpy.data.cameras.new('c'); cam.type='ORTHO'; cam.ortho_scale=0.85; co=bpy.data.objects.new('c',cam); sc.collection.objects.link(co); sc.camera=co
for n,a in [('face',25),('tranche',95)]:
    r=math.radians(a); co.location=(2*math.sin(r), -2*math.cos(r), -0.27); co.rotation_euler=(math.radians(90),0,r)
    sc.render.filepath=os.path.abspath(f'epee_{n}.png'); bpy.ops.render.render(write_still=True)
cam.ortho_scale=0.16; co.location=(0.5*math.sin(0.4), -0.5*math.cos(0.4), -0.6); co.rotation_euler=(math.radians(90),0,0.4); sc.render.resolution_y=360
sc.render.filepath=os.path.abspath('epee_pointe.png'); bpy.ops.render.render(write_still=True)
