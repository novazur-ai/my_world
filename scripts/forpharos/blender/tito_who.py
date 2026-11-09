import bpy, os, sys
from mathutils import Vector
from mathutils.kdtree import KDTree
bpy.ops.wm.open_mainfile(filepath=os.path.abspath('tito_anim.blend'))
sc=bpy.context.scene; arm=bpy.data.objects['Rig']; sw=bpy.data.objects['Epee']; ti=bpy.data.objects['Tito']
names={g.index:g.name for g in ti.vertex_groups}
for spec in sys.argv[sys.argv.index('--')+1:]:
    act,f,z=spec.split(':'); arm.animation_data.action=bpy.data.actions[act]; sc.frame_set(int(f))
    dg=bpy.context.evaluated_depsgraph_get(); te=ti.evaluated_get(dg); me=te.to_mesh()
    kd=KDTree(len(me.vertices)); [kd.insert(te.matrix_world@v.co,i) for i,v in enumerate(me.vertices)]; kd.balance()
    p=sw.matrix_world@Vector((0,0,float(z))); out=[]
    for co,i,d in kd.find_n(p,6):
        g=max(ti.data.vertices[i].groups,key=lambda g:g.weight,default=None); out.append((names[g.group] if g else '-',round(d,3)))
    te.to_mesh_clear(); print(act,f,z,tuple(round(x,2) for x in p),out)
