import trimesh

from services.mesh.thumbnail import render_glb_thumbnail


def test_render_glb_thumbnail_writes_png(tmp_path):
    glb = tmp_path / "box.glb"
    trimesh.creation.box().export(glb)
    out = tmp_path / "thumb.png"
    assert render_glb_thumbnail(glb, out)
    assert out.is_file()
    assert out.stat().st_size > 200
