#!/bin/sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
sdk_ref=${1:-}
action_ref=${2:-}
template_revision=${3:-}

if [ "$#" -ne 3 ]; then
  printf '%s\n' 'usage: bootstrap/render.sh SDK_IMAGE@sha256:DIGEST UOR-Foundation/PrismPM/action@COMMIT POLICY_INPUT_COMMIT' >&2
  exit 64
fi

case "$sdk_ref" in
  *@sha256:????????????????????????????????????????????????????????????????) ;;
  *)
    printf '%s\n' 'SDK_IMAGE must be an OCI image name and lowercase SHA-256 manifest digest' >&2
    exit 64
    ;;
esac

case "$action_ref" in
  UOR-Foundation/PrismPM/action@????????????????????????????????????????) ;;
  *)
    printf '%s\n' 'ACTION_REFERENCE must select the PrismPM action at a full commit' >&2
    exit 64
    ;;
esac
action_revision=${action_ref##*@}
case "$action_revision" in
  *[!0-9a-f]*)
    printf '%s\n' 'ACTION_REFERENCE contains a non-lowercase-hex commit' >&2
    exit 64
    ;;
esac

digest=${sdk_ref##*@sha256:}
image_name=${sdk_ref%@sha256:*}
case "$digest" in
  *[!0-9a-f]*)
    printf '%s\n' 'SDK_IMAGE contains a non-lowercase-hex digest' >&2
    exit 64
    ;;
esac
case "$image_name" in
  ''|*[!a-z0-9./_:-]*)
    printf '%s\n' 'SDK_IMAGE contains a malformed OCI image name' >&2
    exit 64
    ;;
esac

case "$template_revision" in
  ????????????????????????????????????????) ;;
  *)
    printf '%s\n' 'POLICY_INPUT_COMMIT must be a complete 40-character commit' >&2
    exit 64
    ;;
esac
case "$template_revision" in
  *[!0-9a-f]*)
    printf '%s\n' 'POLICY_INPUT_COMMIT contains a non-lowercase-hex commit' >&2
    exit 64
    ;;
esac

head_revision=$(git -C "$repository_root" rev-parse HEAD)
if [ "$head_revision" != "$template_revision" ]; then
  printf '%s\n' 'POLICY_INPUT_COMMIT must equal the checked-out policy commit' >&2
  exit 64
fi
set -- \
  .devcontainer/devcontainer.json \
  .github/workflows/bootstrap.yml \
  .github/workflows/prismpm.yml \
  .github/workflows/template-update.yml \
  AGENTS.md CONFORMANCE.md TEMPLATE-CONTRACT.md TEMPLATE-VERIFICATION.md VERIFICATION.md \
  bootstrap/render.mjs bootstrap/render.sh template-contract.json
for path do
  if ! git -C "$repository_root" ls-files --error-unmatch "$path" >/dev/null 2>&1; then
    printf '%s\n' "policy input is not committed: $path" >&2
    exit 64
  fi
done
if ! git -C "$repository_root" diff --quiet -- "$@" || \
   ! git -C "$repository_root" diff --cached --quiet -- "$@"; then
  printf '%s\n' 'uncommitted universal policy changes must be committed before rendering' >&2
  exit 64
fi

docker run --rm \
  --user "$(id -u):$(id -g)" \
  --network none \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --volume "$repository_root:/workspace" \
  --workdir /workspace \
  --entrypoint node \
  "$sdk_ref" \
  bootstrap/render.mjs "$sdk_ref" "$action_ref" "$template_revision"
