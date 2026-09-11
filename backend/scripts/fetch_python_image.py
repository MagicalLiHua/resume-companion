"""Prepare an official Linux/amd64 Python image without a local Docker daemon.

Registry token stays in memory. Verify the manifest, compressed layers, and
uncompressed filesystem digests before creating a Docker load archive.
"""

import gzip
import hashlib
import json
import shutil
import tarfile
from pathlib import Path

import httpx

OUTPUT = Path(__file__).resolve().parents[2] / "artifacts" / "backend-offline"
REGISTRY = "https://docker.m.daocloud.io/v2/library/python"
ACCEPT = ", ".join(
    [
        "application/vnd.oci.image.index.v1+json",
        "application/vnd.docker.distribution.manifest.list.v2+json",
        "application/vnd.oci.image.manifest.v1+json",
        "application/vnd.docker.distribution.manifest.v2+json",
    ]
)


def digest(data):
    return "sha256:" + hashlib.sha256(data).hexdigest()


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    staging = OUTPUT / "python-image"
    staging.mkdir(exist_ok=True)
    # The connected preparation machine may need its configured outbound proxy.
    # Runtime model requests separately disable environment proxy inheritance.
    with httpx.Client(timeout=60, follow_redirects=False, trust_env=True) as client:
        published = client.get("https://hub.docker.com/v2/repositories/library/python/tags/3.12-slim")
        published.raise_for_status()
        selected = next(
            m
            for m in published.json()["images"]
            if m.get("architecture") == "amd64" and m.get("os") == "linux"
        )
        response = client.get(
            "https://m.daocloud.io/auth/token",
            params={
                "service": "docker.m.daocloud.io",
                "scope": "repository:library/python:pull",
            },
        )
        response.raise_for_status()
        token = response.json()["token"]

        def fetch(url):
            for _ in range(5):
                headers = {"Accept": ACCEPT}
                if url.startswith(REGISTRY + "/"):
                    headers["Authorization"] = f"Bearer {token}"
                reply = client.get(url, headers=headers)
                if reply.is_redirect:
                    url = reply.headers["location"]
                    if not url.startswith("https://"):
                        raise ValueError("Refusing a non-HTTPS registry redirect")
                    continue
                reply.raise_for_status()
                return reply.content
            raise ValueError("Too many registry redirects")

        # The expected manifest digest comes from official Docker Hub metadata;
        # the mirror cannot substitute different filesystem layers undetected.
        manifest_bytes = fetch(REGISTRY + "/manifests/" + selected["digest"])
        assert digest(manifest_bytes) == selected["digest"]
        manifest = json.loads(manifest_bytes)
        config_bytes = fetch(REGISTRY + "/blobs/" + manifest["config"]["digest"])
        assert digest(config_bytes) == manifest["config"]["digest"]
        config = json.loads(config_bytes)
        assert config["os"] == "linux" and config["architecture"] == "amd64"
        config_name = manifest["config"]["digest"].split(":")[1] + ".json"
        (staging / config_name).write_bytes(config_bytes)
        layers = []
        for index, layer in enumerate(manifest["layers"]):
            data = fetch(REGISTRY + "/blobs/" + layer["digest"])
            assert digest(data) == layer["digest"] and len(data) == layer["size"]
            name = f"layer-{index}/layer.tar"
            destination = staging / name
            destination.parent.mkdir(exist_ok=True)
            compressed = staging / f"layer-{index}.gz"
            compressed.write_bytes(data)
            with gzip.open(compressed, "rb") as source, destination.open("wb") as output:
                shutil.copyfileobj(source, output)
            with destination.open("rb") as stream:
                actual = "sha256:" + hashlib.file_digest(stream, "sha256").hexdigest()
            assert actual == config["rootfs"]["diff_ids"][index]
            layers.append(name)
            print(f"已校验 Python 镜像层 {index + 1}/{len(manifest['layers'])}", flush=True)
        docker_manifest = [
            {"Config": config_name, "RepoTags": ["resume-python:3.12-offline"], "Layers": layers}
        ]
        (staging / "manifest.json").write_text(json.dumps(docker_manifest))
        archive = OUTPUT / "python-3.12-linux-amd64.tar.gz"
        with tarfile.open(archive, "w:gz") as tar:
            for name in [config_name, "manifest.json", *layers]:
                tar.add(staging / name, arcname=name)
        metadata = {
            "source": "docker.io/library/python:3.12-slim",
            "platform": "linux/amd64",
            "download_mirror": "docker.m.daocloud.io",
            "registry_manifest": selected["digest"],
            "config_digest": manifest["config"]["digest"],
            "rootfs_diff_ids": config["rootfs"]["diff_ids"],
            "local_tag": "resume-python:3.12-offline",
            "archive_bytes": archive.stat().st_size,
            "archive_sha256": digest(archive.read_bytes()),
        }
        (OUTPUT / "python-image.metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
        print(json.dumps(metadata), flush=True)


if __name__ == "__main__":
    main()
