import bpy, os
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath=os.path.abspath('tito_anim.blend'))
sc=bpy.context.scene; arm=bpy.data.objects['Rig']; sw=bpy.data.objects['Epee']; me=sw.data
zs=[v.co.z for v in me.vertices]; print('epee z local min/max', round(min(zs),3), round(max(zs),3))
for act,f in [('Attente',1),('Attaque',14),('Victoire',25)]:
    arm.animation_data.action=bpy.data.actions[act]; sc.frame_set(f); bpy.context.view_layer.update()
    pb=arm.pose.bones['hand.R']; tail=arm.matrix_world@pb.tail; head=arm.matrix_world@pb.head; fist=(head+tail)/2
    grip=sw.matrix_world@Vector((0,0,0)); tip=sw.matrix_world@Vector((0,0,min(zs)))
    print(act, 'poing-poignee', round((grip-fist).length,3), 'poing-pointe', round((tip-fist).length,3))
