import bpy, os, math
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath=os.path.abspath('tito_anim.blend'))
sc=bpy.context.scene; arm=bpy.data.objects['Rig']; sw=bpy.data.objects['Epee']
for act,f in [('Course',4),('Attaque',8),('Attaque',14),('Victoire',13),('Victoire',25),('Victoire',37)]:
    arm.animation_data.action=bpy.data.actions[act]; sc.frame_set(f); bpy.context.view_layer.update()
    pb=arm.pose.bones['hand.R']; q=pb.rotation_quaternion.copy()
    M=sw.matrix_world; d=((M@Vector((0,0,-0.5)))-M.translation).normalized(); h=arm.matrix_world@pb.head
    pb.rotation_quaternion=(1,0,0,0); bpy.context.view_layer.update()
    M=sw.matrix_world; n=((M@Vector((0,0,-0.5)))-M.translation).normalized()
    pb.rotation_quaternion=q
    print(act,f,'main',tuple(round(x,2) for x in h),'visée',tuple(round(x,2) for x in d),'naturel',tuple(round(x,2) for x in n))
