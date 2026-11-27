from pathlib import Path

import pytest
from generate_krea2 import build_workflow, checked_base_url, load_character


def test_character_yaml_loads_and_graph_has_no_input_reference():
    character = load_character(Path(__file__).with_name("character.yaml"))
    graph = build_workflow(character, 12345)
    assert graph["7"]["inputs"]["seed"] == 12345
    assert graph["6"]["inputs"]["width"] == 896
    assert graph["6"]["inputs"]["height"] == 1344
    assert all(node["class_type"] != "LoadImage" for node in graph.values())
    assert graph["9"]["class_type"] == "SaveImage"


def test_base_url_rejects_embedded_credentials_and_invalid_schemes():
    with pytest.raises(ValueError):
        checked_base_url("http://user:pass@localhost:8189")
    with pytest.raises(ValueError):
        checked_base_url("file:///tmp/comfy")
    assert checked_base_url("http://localhost:8189/") == "http://localhost:8189"
